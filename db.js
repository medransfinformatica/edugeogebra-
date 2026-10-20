(function () {
    'use strict';

    var PREFIX = 'ggschool_';
    var CryptoJS = window.CryptoJS || null;
    var SECRET_KEY = 'gG5-2026::EduNet::v1::9f3c7a1e5b2d8c4a::local';
    var PREFIJO_CIFRADO = 'GGSENC1:';
    var SESION_DURACION_MS = 30 * 60 * 1000;
    var PASSWORD_ITERACIONES = 10000;

    var KEYS = {
        usuarios: PREFIX + 'usuarios',
        clases: 'clases_creadas',
        inscripciones: 'inscripciones_clases',
        trabajos: PREFIX + 'trabajos',
        config: PREFIX + 'config',
        sesion: PREFIX + 'sesion',
        nubeMigrada: PREFIX + 'nube_migrada',
        nubeUrl: PREFIX + 'nube_url'
    };

    var CLAVES_ANTERIORES = {
        clases: PREFIX + 'clases',
        inscripciones: PREFIX + 'inscripciones'
    };

    var CONFIG_POR_DEFECTO = {
        nombre_escuela: 'E.E.S.T. N°1',
        nombre_sistema: 'Edunet',
        telefono: '',
        email_institucional: '',
        direccion: ''
    };

    function cryptoDisponible() {
        return !!(CryptoJS && CryptoJS.AES && CryptoJS.SHA256 && CryptoJS.PBKDF2 && CryptoJS.lib);
    }

    function cifrar(valor) {
        if (!cryptoDisponible()) {
            throw new Error('No se pudo inicializar el cifrado. Verificá la carga de CryptoJS.');
        }

        return PREFIJO_CIFRADO + CryptoJS.AES.encrypt(
            JSON.stringify(valor),
            SECRET_KEY
        ).toString();
    }

    function descifrar(crudo) {
        if (!cryptoDisponible()) {
            throw new Error('No se pudo inicializar el descifrado. Verificá la carga de CryptoJS.');
        }

        var texto = CryptoJS.AES.decrypt(
            crudo.slice(PREFIJO_CIFRADO.length),
            SECRET_KEY
        ).toString(CryptoJS.enc.Utf8);

        if (!texto) {
            throw new Error('El contenido cifrado no es válido.');
        }

        return JSON.parse(texto);
    }

    function leer(clave, porDefecto) {
        try {
            var crudo = localStorage.getItem(clave);

            if (crudo === null) {
                return porDefecto;
            }

            if (crudo.indexOf(PREFIJO_CIFRADO) === 0) {
                return descifrar(crudo);
            }

            return JSON.parse(crudo);
        } catch (error) {
            console.error('No se pudo leer el almacenamiento local:', clave, error);
            return porDefecto;
        }
    }

    function escribir(clave, valor) {
        try {
            localStorage.setItem(clave, cifrar(valor));
            return true;
        } catch (error) {
            console.error('No se pudo guardar en el almacenamiento local:', clave, error);
            return false;
        }
    }

    function existeClave(clave) {
        try {
            return localStorage.getItem(clave) !== null;
        } catch (error) {
            return false;
        }
    }

    function generarIdUnico() {
        return Date.now() * 1000 + Math.floor(Math.random() * 1000);
    }

    function idDesdeEmail(email) {
        if (!cryptoDisponible()) {
            return generarIdUnico();
        }

        var hash = CryptoJS.SHA256(normalizarEmail(email)).toString(CryptoJS.enc.Hex);
        var id = parseInt(hash.slice(0, 12), 16);
        return id > 0 ? id : generarIdUnico();
    }

    function normalizarEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function normalizarTexto(texto) {
        return String(texto || '').trim();
    }

    function normalizarCodigo(codigo) {
        return String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function generarSalt() {
        if (!cryptoDisponible()) {
            throw new Error('No se pudo generar la sal de la contraseña.');
        }

        return CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
    }

    function hashPassword(password, salt) {
        if (!cryptoDisponible()) {
            throw new Error('No se pudo calcular el hash de la contraseña.');
        }

        return CryptoJS.PBKDF2(String(password), String(salt), {
            keySize: 256 / 32,
            iterations: PASSWORD_ITERACIONES,
            hasher: CryptoJS.algo.SHA256
        }).toString(CryptoJS.enc.Hex);
    }

    function asegurarHashUsuario(usuario, passwordPlano) {
        if (usuario.password_hash && usuario.password_salt) {
            return;
        }

        var plano = passwordPlano !== undefined ? passwordPlano : usuario.password;

        if (plano === undefined || plano === null) {
            return;
        }

        var salt = generarSalt();
        usuario.password_salt = salt;
        usuario.password_hash = hashPassword(String(plano), salt);
        delete usuario.password;
    }

    function crearUsuarioDemo(id, nombre, email, password, rol) {
        var salt = generarSalt();

        return {
            id: id,
            nombre: nombre,
            email: email,
            password_salt: salt,
            password_hash: hashPassword(password, salt),
            rol: rol,
            clases_ids: [],
            creado_en: new Date().toISOString()
        };
    }

    function migrarPasswordsUsuarios() {
        var usuarios = leer(KEYS.usuarios, null);

        if (!Array.isArray(usuarios)) {
            return;
        }

        var cambios = false;

        usuarios.forEach(function (usuario) {
            if (usuario && usuario.password !== undefined) {
                asegurarHashUsuario(usuario);
                cambios = true;
            }
        });

        if (cambios) {
            escribir(KEYS.usuarios, usuarios);
        }
    }

    function notificarCambio(tipo) {
        try {
            window.dispatchEvent(new CustomEvent('ggs:datachange', {
                detail: { tipo: tipo }
            }));
        } catch (error) {
            console.warn('No se pudo emitir el evento de actualización:', error);
        }
    }

    function eliminarSesion() {
        try {
            localStorage.removeItem(KEYS.sesion);
        } catch (error) {
            console.error('No se pudo eliminar la sesión del almacenamiento local:', error);
        }
    }

    function generarCodigo() {
        var caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var codigo = '';

        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            var valores = new Uint32Array(6);
            window.crypto.getRandomValues(valores);
            for (var i = 0; i < 6; i++) {
                codigo += caracteres.charAt(valores[i] % caracteres.length);
            }
        } else {
            for (var j = 0; j < 6; j++) {
                codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
            }
        }

        return codigo;
    }

    function migrarAlmacenamiento() {
        var claves = [
            KEYS.usuarios,
            KEYS.clases,
            KEYS.inscripciones,
            KEYS.trabajos,
            KEYS.config,
            KEYS.sesion,
            CLAVES_ANTERIORES.clases,
            CLAVES_ANTERIORES.inscripciones
        ];

        claves.forEach(function (clave) {
            var crudo;

            try {
                crudo = localStorage.getItem(clave);
            } catch (error) {
                return;
            }

            if (crudo === null || crudo.indexOf(PREFIJO_CIFRADO) === 0) {
                return;
            }

            try {
                escribir(clave, JSON.parse(crudo));
            } catch (error) {
                console.warn('No se pudo cifrar el contenido anterior:', clave, error);
            }
        });
    }

    function migrarArray(claveAnterior, claveNueva, esDuplicado) {
        var anteriores = leer(claveAnterior, null);

        if (!Array.isArray(anteriores)) {
            return;
        }

        var actuales = leer(claveNueva, null);
        var destino = Array.isArray(actuales) ? actuales.slice() : [];

        anteriores.forEach(function (item) {
            var existe = destino.some(function (existente) {
                return esDuplicado(existente, item);
            });

            if (!existe) {
                destino.push(item);
            }
        });

        if (escribir(claveNueva, destino)) {
            try {
                localStorage.removeItem(claveAnterior);
            } catch (error) {
                console.warn('No se pudo eliminar la clave anterior:', claveAnterior, error);
            }
        }
    }

    function migrarClavesAnteriores() {
        migrarArray(CLAVES_ANTERIORES.clases, KEYS.clases, function (a, b) {
            return Number(a.id) === Number(b.id) ||
                (a.codigo_acceso && b.codigo_acceso &&
                    normalizarCodigo(a.codigo_acceso) === normalizarCodigo(b.codigo_acceso));
        });

        migrarArray(CLAVES_ANTERIORES.inscripciones, KEYS.inscripciones, function (a, b) {
            return Number(a.clase_id) === Number(b.clase_id) &&
                Number(a.alumno_id) === Number(b.alumno_id);
        });
    }

    function sincronizarVinculosExistentes() {
        var inscripciones = getInscripciones();
        var clases = getClases();
        var usuarios = getUsuarios();
        var cambiosClases = false;
        var cambiosUsuarios = false;

        inscripciones.forEach(function (inscripcion) {
            var claseId = Number(inscripcion.clase_id);
            var alumnoId = Number(inscripcion.alumno_id);
            var clase = clases.find(function (item) {
                return Number(item.id) === claseId;
            });

            if (clase) {
                var alumnosIds = Array.isArray(clase.alumnos_ids) ? clase.alumnos_ids.map(Number) : [];

                if (alumnosIds.indexOf(alumnoId) === -1) {
                    alumnosIds.push(alumnoId);
                    clase.alumnos_ids = alumnosIds;
                    cambiosClases = true;
                }
            }

            var alumno = usuarios.find(function (item) {
                return Number(item.id) === alumnoId;
            });

            if (alumno) {
                var clasesIds = Array.isArray(alumno.clases_ids) ? alumno.clases_ids.map(Number) : [];

                if (clasesIds.indexOf(claseId) === -1) {
                    clasesIds.push(claseId);
                    alumno.clases_ids = clasesIds;
                    cambiosUsuarios = true;
                }
            }
        });

        if (cambiosClases) {
            escribir(KEYS.clases, clases);
        }

        if (cambiosUsuarios) {
            escribir(KEYS.usuarios, usuarios);
        }
    }

    function nubeConfigurada() {
        return !!(window.GGS_CLOUD &&
            typeof window.GGS_CLOUD.configurado === 'function' &&
            window.GGS_CLOUD.configurado());
    }

    function nubeDisponible() {
        return !!(window.GGS_CLOUD &&
            typeof window.GGS_CLOUD.disponible === 'function' &&
            window.GGS_CLOUD.disponible());
    }

    var escuchaNubeConfigurada = false;

    function aplicarDatosNube(datos) {
        escribir(KEYS.clases, datos.clases || []);
        escribir(KEYS.inscripciones, datos.inscripciones || []);
        escribir(KEYS.trabajos, datos.trabajos || []);
        configurarEscuchaNube();
        notificarCambio('nube');
        return true;
    }

    function sincronizarNube() {
        if (!nubeConfigurada()) {
            return Promise.resolve(false);
        }

        return window.GGS_CLOUD.iniciar().then(function (iniciado) {
            if (!iniciado) {
                return false;
            }

            return window.GGS_CLOUD.getTodosDatos().then(aplicarDatosNube);
        });
    }

    function datosLocalesParaNube() {
        var usuarios = getUsuarios();

        function completarAlumno(item) {
            var usuario = usuarios.find(function (candidato) {
                return Number(candidato.id) === Number(item.alumno_id);
            });
            var copia = {};

            Object.keys(item).forEach(function (clave) {
                copia[clave] = item[clave];
            });

            copia.alumno_nombre = item.alumno_nombre || (usuario ? usuario.nombre : '');
            copia.alumno_email = item.alumno_email || (usuario ? usuario.email : '');
            return copia;
        }

        return {
            clases: getClases(),
            inscripciones: getInscripciones().map(completarAlumno),
            trabajos: getTrabajos().map(completarAlumno)
        };
    }

    function configurarEscuchaNube() {
        if (escuchaNubeConfigurada || !nubeDisponible()) {
            return;
        }

        escuchaNubeConfigurada = true;

        window.GGS_CLOUD.escucharCambios(function () {
            return sincronizarNube().catch(function (error) {
                console.error('No se pudo sincronizar desde el servidor JSON:', error);
            });
        });
    }

    function conLimite(promesa, milisegundos) {
        return Promise.race([
            promesa,
            new Promise(function (resolve) {
                window.setTimeout(function () {
                    resolve(false);
                }, milisegundos);
            })
        ]);
    }

    function iniciarNube() {
        if (!nubeConfigurada()) {
            return Promise.resolve(false);
        }

        return window.GGS_CLOUD.iniciar().then(function (iniciado) {
            if (!iniciado) {
                return false;
            }

            var urlNube = typeof window.GGS_CLOUD.url === 'function' ? window.GGS_CLOUD.url() : '';
            var urlGuardada = leer(KEYS.nubeUrl, '');
            var migrada = leer(KEYS.nubeMigrada, false) === true &&
                (!urlNube || urlGuardada === urlNube);

            function marcarNubeSincronizada() {
                escribir(KEYS.nubeMigrada, true);
                escribir(KEYS.nubeUrl, urlNube);
            }

            return conLimite(window.GGS_CLOUD.getTodosDatos().then(function (datos) {
                if (migrada) {
                    return aplicarDatosNube(datos);
                }

                var locales = datosLocalesParaNube();

                if (!datos.clases.length && locales.clases.length) {
                    return window.GGS_CLOUD.importarDatos(locales)
                        .then(function () {
                            return window.GGS_CLOUD.getTodosDatos();
                        })
                        .then(function (actualizados) {
                            marcarNubeSincronizada();
                            return aplicarDatosNube(actualizados);
                        });
                }

                marcarNubeSincronizada();
                return aplicarDatosNube(datos);
            }), 20000).then(function (resultado) {
                return resultado === true;
            });
        }).catch(function (error) {
            console.error('No se pudo iniciar la sincronización con el servidor JSON:', error);
            return false;
        });
    }

    function inicializar() {
        if (!cryptoDisponible()) {
            console.error('CryptoJS no está disponible. No se puede inicializar el almacenamiento cifrado.');
            return;
        }

        migrarAlmacenamiento();
        migrarClavesAnteriores();

        if (!existeClave(KEYS.usuarios)) {
            escribir(KEYS.usuarios, [
                crearUsuarioDemo(1, 'Administrador', 'admin@edunet.com', 'admin123', 'administrador'),
                crearUsuarioDemo(2, 'Profesora Demo', 'profesor@edunet.com', 'profesor123', 'profesor'),
                crearUsuarioDemo(3, 'Alumno Demo', 'alumno@edunet.com', 'alumno123', 'alumno')
            ]);
        }

        if (!existeClave(KEYS.clases)) {
            escribir(KEYS.clases, []);
        }

        if (!existeClave(KEYS.inscripciones)) {
            escribir(KEYS.inscripciones, []);
        }

        if (!existeClave(KEYS.trabajos)) {
            escribir(KEYS.trabajos, []);
        }

        if (!existeClave(KEYS.config)) {
            escribir(KEYS.config, CONFIG_POR_DEFECTO);
        }

        migrarPasswordsUsuarios();
        sincronizarVinculosExistentes();
    }

    /* ---------------------------------------------------------------------
       Usuarios y sesión
       --------------------------------------------------------------------- */

    function getUsuarios() {
        return leer(KEYS.usuarios, []);
    }

    function registrar(datos) {
        var usuarios = getUsuarios();
        var nombre = normalizarTexto(datos.nombre);
        var email = normalizarEmail(datos.email);
        var password = String(datos.password || '');
        var rol = datos.rol;

        if (!nombre || !email || !password) {
            throw new Error('Completá todos los campos.');
        }

        if (nombre.length > 100) {
            throw new Error('El nombre no puede superar los 100 caracteres.');
        }

        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('El email no tiene un formato válido.');
        }

        if (password.length < 6 || password.length > 128) {
            throw new Error('La contraseña debe tener entre 6 y 128 caracteres.');
        }

        if (rol !== 'alumno' && rol !== 'profesor') {
            throw new Error('El rol seleccionado no es válido.');
        }

        var existe = usuarios.some(function (usuario) {
            return normalizarEmail(usuario.email) === email;
        });

        if (existe) {
            throw new Error('El email ya está registrado.');
        }

        var salt = generarSalt();
        var nuevoUsuario = {
            id: idDesdeEmail(email),
            nombre: nombre,
            email: email,
            password_salt: salt,
            password_hash: hashPassword(password, salt),
            rol: rol,
            clases_ids: [],
            creado_en: new Date().toISOString()
        };

        usuarios.push(nuevoUsuario);

        if (!escribir(KEYS.usuarios, usuarios)) {
            throw new Error('No se pudo guardar el usuario en el almacenamiento local.');
        }

        return nuevoUsuario;
    }

    function login(email, password) {
        var usuarios = getUsuarios();
        var usuario = usuarios.find(function (item) {
            return normalizarEmail(item.email) === normalizarEmail(email);
        });

        if (!usuario) {
            return null;
        }

        var valido = false;

        if (usuario.password_hash && usuario.password_salt) {
            valido = hashPassword(password, usuario.password_salt) === usuario.password_hash;
        } else if (usuario.password !== undefined) {
            valido = String(usuario.password) === String(password);

            if (valido) {
                asegurarHashUsuario(usuario, password);

                if (!escribir(KEYS.usuarios, usuarios)) {
                    return null;
                }
            }
        }

        if (!valido) {
            return null;
        }

        var ahora = new Date().toISOString();
        var sesion = {
            usuario_id: usuario.id,
            nombre: usuario.nombre,
            rol: usuario.rol,
            iniciada_en: ahora,
            ultima_actividad: ahora
        };

        if (!escribir(KEYS.sesion, sesion)) {
            return null;
        }

        return sesion;
    }

    function sesionVigente(sesion) {
        if (!sesion || !sesion.usuario_id) {
            return false;
        }

        var referencia = sesion.ultima_actividad || sesion.iniciada_en;
        var ultima = Date.parse(referencia);

        return isFinite(ultima) && Date.now() - ultima <= SESION_DURACION_MS;
    }

    function getSesion() {
        var sesion = leer(KEYS.sesion, null);

        if (!sesionVigente(sesion)) {
            if (sesion) {
                eliminarSesion();
            }

            return null;
        }

        var usuario = getUsuarios().find(function (item) {
            return Number(item.id) === Number(sesion.usuario_id);
        });

        if (!usuario) {
            eliminarSesion();
            return null;
        }

        return {
            usuario_id: usuario.id,
            nombre: usuario.nombre,
            rol: usuario.rol,
            iniciada_en: sesion.iniciada_en || null,
            ultima_actividad: sesion.ultima_actividad || null
        };
    }

    function renovarSesion() {
        var sesion = leer(KEYS.sesion, null);

        if (!sesionVigente(sesion)) {
            eliminarSesion();
            return null;
        }

        sesion.ultima_actividad = new Date().toISOString();

        if (!escribir(KEYS.sesion, sesion)) {
            return null;
        }

        return getSesion();
    }

    function logout() {
        eliminarSesion();
    }

    /* ---------------------------------------------------------------------
       Configuración institucional
       --------------------------------------------------------------------- */

    function getDiagnostico() {
        return {
            origen: (window.location && window.location.origin) || 'file://',
            protocolo: (window.location && window.location.protocol) || 'file:',
            cifrado: cryptoDisponible(),
            nubeConfigurada: nubeConfigurada(),
            nubeActiva: nubeDisponible(),
            origenDatos: nubeDisponible() ? 'json-remoto' : 'local',
            sesionActiva: !!getSesion(),
            totalClases: getClases().length,
            totalInscripciones: getInscripciones().length,
            totalUsuarios: getUsuarios().length
        };
    }

    function getConfig() {
        var guardada = leer(KEYS.config, null);
        var config = {};

        Object.keys(CONFIG_POR_DEFECTO).forEach(function (clave) {
            config[clave] = CONFIG_POR_DEFECTO[clave];
        });

        if (guardada && typeof guardada === 'object') {
            Object.keys(guardada).forEach(function (clave) {
                config[clave] = guardada[clave];
            });
        }

        return config;
    }

    function guardarConfig(datos) {
        var config = getConfig();

        Object.keys(CONFIG_POR_DEFECTO).forEach(function (clave) {
            if (Object.prototype.hasOwnProperty.call(datos, clave)) {
                config[clave] = normalizarTexto(datos[clave]);
            }
        });

        if (!config.nombre_escuela || !config.nombre_sistema) {
            throw new Error('Los campos Nombre de la escuela y Nombre del sistema son obligatorios.');
        }

        if (!escribir(KEYS.config, config)) {
            throw new Error('No se pudo guardar la configuración.');
        }

        return config;
    }

    /* ---------------------------------------------------------------------
       Clases
       --------------------------------------------------------------------- */

    function getClases() {
        migrarClavesAnteriores();
        return leer(KEYS.clases, []);
    }

    function getClasePorId(id) {
        return getClases().find(function (clase) {
            return Number(clase.id) === Number(id);
        }) || null;
    }

    function getClasePorCodigo(codigo) {
        var buscado = normalizarCodigo(codigo);

        if (!buscado) {
            return null;
        }

        return getClases().find(function (clase) {
            return normalizarCodigo(clase.codigo_acceso) === buscado;
        }) || null;
    }

    function getClasesDeProfesor(profesorId) {
        return getClases()
            .filter(function (clase) {
                return Number(clase.profesor_id) === Number(profesorId);
            })
            .sort(function (a, b) {
                return Number(b.id) - Number(a.id);
            });
    }

    function crearClaseLocal(profesorId, nombre, tema) {
        var nombreClase = normalizarTexto(nombre);

        if (!nombreClase) {
            throw new Error('El nombre de la clase es obligatorio.');
        }

        var clases = getClases();
        var usuarios = getUsuarios();
        var profesor = usuarios.find(function (usuario) {
            return Number(usuario.id) === Number(profesorId);
        });
        var codigo;

        do {
            codigo = generarCodigo();
        } while (clases.some(function (clase) {
            return normalizarCodigo(clase.codigo_acceso) === codigo;
        }));

        var nuevaClase = {
            id: generarIdUnico(),
            profesor_id: Number(profesorId),
            profesor_nombre: profesor ? profesor.nombre : 'Profesor',
            profesor_email: profesor ? profesor.email : '',
            nombre_clase: nombreClase,
            tema: normalizarTexto(tema),
            codigo_acceso: codigo,
            alumnos_ids: [],
            creada_en: new Date().toISOString()
        };

        clases.push(nuevaClase);

        if (!escribir(KEYS.clases, clases)) {
            throw new Error('No se pudo guardar la clase en el almacenamiento local.');
        }

        notificarCambio('clases');
        return nuevaClase;
    }

    function crearClase(profesorId, nombre, tema) {
        var nombreClase = normalizarTexto(nombre);

        if (!nombreClase) {
            return Promise.reject(new Error('El nombre de la clase es obligatorio.'));
        }

        if (!nubeDisponible()) {
            return Promise.resolve().then(function () {
                return crearClaseLocal(profesorId, nombre, tema);
            });
        }

        var profesor = getUsuarios().find(function (usuario) {
            return Number(usuario.id) === Number(profesorId);
        });

        return window.GGS_CLOUD.crearClase({
            profesor_id: Number(profesorId),
            profesor_nombre: profesor ? profesor.nombre : 'Profesor',
            profesor_email: profesor ? profesor.email : '',
            nombre_clase: nombreClase,
            tema: normalizarTexto(tema)
        }).then(function (clase) {
            var clases = getClases().filter(function (item) {
                return Number(item.id) !== Number(clase.id);
            });

            clases.push(clase);

            if (!escribir(KEYS.clases, clases)) {
                console.warn('La clase se guardó en el servidor JSON, pero no en la caché local.');
            }

            notificarCambio('clases');
            return clase;
        });
    }

    function quitarClaseDeCache(claseId) {
        escribir(KEYS.clases, getClases().filter(function (item) {
            return Number(item.id) !== Number(claseId);
        }));

        escribir(KEYS.inscripciones, getInscripciones().filter(function (item) {
            return Number(item.clase_id) !== Number(claseId);
        }));

        escribir(KEYS.trabajos, getTrabajos().filter(function (item) {
            return Number(item.clase_id) !== Number(claseId);
        }));

        var usuarios = getUsuarios();
        var cambiosUsuarios = false;

        usuarios.forEach(function (usuario) {
            if (!Array.isArray(usuario.clases_ids)) {
                return;
            }

            var clasesFiltradas = usuario.clases_ids.filter(function (id) {
                return Number(id) !== Number(claseId);
            });

            if (clasesFiltradas.length !== usuario.clases_ids.length) {
                usuario.clases_ids = clasesFiltradas;
                cambiosUsuarios = true;
            }
        });

        if (cambiosUsuarios) {
            escribir(KEYS.usuarios, usuarios);
        }

        notificarCambio('clases');
    }

    function eliminarClaseLocal(claseId, profesorId) {
        var clase = getClases().find(function (item) {
            return Number(item.id) === Number(claseId) &&
                Number(item.profesor_id) === Number(profesorId);
        });

        if (!clase) {
            return false;
        }

        quitarClaseDeCache(claseId);
        return true;
    }

    function eliminarClase(claseId, profesorId) {
        if (!nubeDisponible()) {
            return Promise.resolve(eliminarClaseLocal(claseId, profesorId));
        }

        return window.GGS_CLOUD.eliminarClase(claseId, profesorId).then(function (eliminada) {
            if (eliminada) {
                quitarClaseDeCache(claseId);
            }

            return eliminada;
        });
    }

    /* ---------------------------------------------------------------------
       Inscripciones
       --------------------------------------------------------------------- */

    function getInscripciones() {
        migrarClavesAnteriores();
        return leer(KEYS.inscripciones, []);
    }

    function estaInscripto(claseId, alumnoId) {
        var enInscripciones = getInscripciones().some(function (inscripcion) {
            return Number(inscripcion.clase_id) === Number(claseId) &&
                Number(inscripcion.alumno_id) === Number(alumnoId);
        });

        if (enInscripciones) {
            return true;
        }

        var clase = getClasePorId(claseId);
        var alumnosIds = clase && Array.isArray(clase.alumnos_ids) ?
            clase.alumnos_ids.map(Number) : [];

        return alumnosIds.indexOf(Number(alumnoId)) !== -1;
    }

    function vincularAlumnoEnClase(claseId, alumnoId) {
        var clases = getClases();
        var clase = clases.find(function (item) {
            return Number(item.id) === Number(claseId);
        });

        if (!clase) {
            return false;
        }

        var alumnosIds = Array.isArray(clase.alumnos_ids) ? clase.alumnos_ids.map(Number) : [];

        if (alumnosIds.indexOf(Number(alumnoId)) === -1) {
            alumnosIds.push(Number(alumnoId));
        }

        clase.alumnos_ids = alumnosIds;
        return escribir(KEYS.clases, clases);
    }

    function vincularClaseEnAlumno(claseId, alumnoId) {
        var usuarios = getUsuarios();
        var alumno = usuarios.find(function (item) {
            return Number(item.id) === Number(alumnoId);
        });

        if (!alumno) {
            return false;
        }

        var clasesIds = Array.isArray(alumno.clases_ids) ? alumno.clases_ids.map(Number) : [];

        if (clasesIds.indexOf(Number(claseId)) === -1) {
            clasesIds.push(Number(claseId));
        }

        alumno.clases_ids = clasesIds;
        return escribir(KEYS.usuarios, usuarios);
    }

    function guardarClaseEnCache(clase) {
        var clases = getClases();
        var indice = -1;

        clases.some(function (item, posicion) {
            if (Number(item.id) === Number(clase.id)) {
                indice = posicion;
                return true;
            }

            return false;
        });

        if (indice >= 0) {
            clases[indice] = clase;
        } else {
            clases.push(clase);
        }

        escribir(KEYS.clases, clases);
    }

    function guardarInscripcionEnCache(clase, alumno) {
        var inscripciones = getInscripciones();
        var existe = inscripciones.some(function (inscripcion) {
            return Number(inscripcion.clase_id) === Number(clase.id) &&
                Number(inscripcion.alumno_id) === Number(alumno.id);
        });

        if (!existe) {
            inscripciones.push({
                id: 'cloud_' + clase.id + '_' + alumno.id,
                clase_id: Number(clase.id),
                alumno_id: Number(alumno.id),
                alumno_nombre: alumno.nombre || 'Alumno',
                alumno_email: alumno.email || '',
                fecha: new Date().toISOString()
            });

            escribir(KEYS.inscripciones, inscripciones);
        }

        vincularClaseEnAlumno(clase.id, alumno.id);
        notificarCambio('inscripciones');
    }

    function unirseAClaseLocal(codigo, alumnoId) {
        var clases = getClases();
        var codigoNormalizado = normalizarCodigo(codigo);
        var clase = clases.find(function (item) {
            return normalizarCodigo(item.codigo_acceso) === codigoNormalizado;
        });

        if (!codigoNormalizado || !clase) {
            return { ok: false, motivo: 'codigo', totalClases: clases.length };
        }

        if (estaInscripto(clase.id, alumnoId)) {
            return { ok: false, motivo: 'duplicado', clase: clase };
        }

        var inscripciones = getInscripciones();

        inscripciones.push({
            id: generarIdUnico(),
            clase_id: Number(clase.id),
            alumno_id: Number(alumnoId),
            fecha: new Date().toISOString()
        });

        if (!escribir(KEYS.inscripciones, inscripciones)) {
            return { ok: false, motivo: 'almacenamiento' };
        }

        vincularAlumnoEnClase(clase.id, alumnoId);
        vincularClaseEnAlumno(clase.id, alumnoId);
        notificarCambio('inscripciones');

        return { ok: true, clase: getClasePorId(clase.id) };
    }

    function unirseAClase(codigo, alumnoId) {
        if (!nubeDisponible()) {
            return Promise.resolve(unirseAClaseLocal(codigo, alumnoId));
        }

        var usuario = getUsuarios().find(function (item) {
            return Number(item.id) === Number(alumnoId);
        });
        var alumno = {
            id: Number(alumnoId),
            nombre: usuario ? usuario.nombre : 'Alumno',
            email: usuario ? usuario.email : ''
        };

        return window.GGS_CLOUD.unirseAClase(codigo, alumno).then(function (resultado) {
            if (resultado && resultado.clase) {
                guardarClaseEnCache(resultado.clase);
            }

            if (resultado && resultado.ok) {
                guardarInscripcionEnCache(resultado.clase, alumno);
            }

            return resultado;
        });
    }

    function getClasesDeAlumno(alumnoId) {
        var usuarios = getUsuarios();
        var alumno = usuarios.find(function (usuario) {
            return Number(usuario.id) === Number(alumnoId);
        });
        var clasesIds = {};

        getInscripciones().forEach(function (inscripcion) {
            if (Number(inscripcion.alumno_id) === Number(alumnoId)) {
                clasesIds[Number(inscripcion.clase_id)] = true;
            }
        });

        if (alumno && Array.isArray(alumno.clases_ids)) {
            alumno.clases_ids.forEach(function (claseId) {
                clasesIds[Number(claseId)] = true;
            });
        }

        getClases().forEach(function (clase) {
            var alumnosIds = Array.isArray(clase.alumnos_ids) ? clase.alumnos_ids.map(Number) : [];

            if (alumnosIds.indexOf(Number(alumnoId)) !== -1) {
                clasesIds[Number(clase.id)] = true;
            }
        });

        return Object.keys(clasesIds)
            .map(function (claseId) {
                var clase = getClasePorId(claseId);

                if (!clase) {
                    return null;
                }

                var profesor = usuarios.find(function (usuario) {
                    return Number(usuario.id) === Number(clase.profesor_id);
                });

                return {
                    id: clase.id,
                    nombre_clase: clase.nombre_clase,
                    tema: clase.tema,
                    codigo_acceso: clase.codigo_acceso,
                    profesor_id: clase.profesor_id,
                    profesor_nombre: profesor ? profesor.nombre : (clase.profesor_nombre || 'Profesor'),
                    profesor_email: profesor ? profesor.email : (clase.profesor_email || '')
                };
            })
            .filter(Boolean)
            .sort(function (a, b) {
                return String(a.nombre_clase).localeCompare(String(b.nombre_clase), 'es');
            });
    }

    function getAlumnosDeClase(claseId) {
        var usuarios = getUsuarios();
        var clase = getClasePorId(claseId);
        var alumnos = {};

        function registrar(alumnoId, nombre, email) {
            var id = Number(alumnoId);

            if (!id) {
                return;
            }

            if (!alumnos[id]) {
                alumnos[id] = { id: id, nombre: '', email: '' };
            }

            if (nombre) {
                alumnos[id].nombre = String(nombre);
            }

            if (email) {
                alumnos[id].email = String(email);
            }
        }

        getInscripciones().forEach(function (inscripcion) {
            if (Number(inscripcion.clase_id) === Number(claseId)) {
                registrar(inscripcion.alumno_id, inscripcion.alumno_nombre, inscripcion.alumno_email);
            }
        });

        if (clase && Array.isArray(clase.alumnos_ids)) {
            clase.alumnos_ids.forEach(function (alumnoId) {
                registrar(alumnoId);
            });
        }

        usuarios.forEach(function (usuario) {
            var clasesIds = Array.isArray(usuario.clases_ids) ? usuario.clases_ids.map(Number) : [];

            if (clasesIds.indexOf(Number(claseId)) !== -1) {
                registrar(usuario.id, usuario.nombre, usuario.email);
            }
        });

        return Object.keys(alumnos)
            .map(function (alumnoId) {
                var alumno = alumnos[alumnoId];
                var usuario = usuarios.find(function (item) {
                    return Number(item.id) === Number(alumnoId);
                });
                var nombre = (usuario && usuario.nombre) || alumno.nombre || ('Alumno #' + alumnoId);
                var email = (usuario && usuario.email) || alumno.email || '';

                return {
                    id: Number(alumnoId),
                    nombre: nombre,
                    email: email
                };
            })
            .sort(function (a, b) {
                return String(a.nombre).localeCompare(String(b.nombre), 'es');
            });
    }

    /* ---------------------------------------------------------------------
       Trabajos
       --------------------------------------------------------------------- */

    function getTrabajos() {
        return leer(KEYS.trabajos, []);
    }

    function getTrabajo(id) {
        return getTrabajos().find(function (trabajo) {
            return Number(trabajo.id) === Number(id);
        }) || null;
    }

    function getTrabajosDeAlumnoEnClase(claseId, alumnoId) {
        return getTrabajos()
            .filter(function (trabajo) {
                return Number(trabajo.clase_id) === Number(claseId) &&
                    Number(trabajo.alumno_id) === Number(alumnoId);
            })
            .sort(function (a, b) {
                return new Date(b.fecha_entrega).getTime() - new Date(a.fecha_entrega).getTime();
            });
    }

    function guardarTrabajoLocal(datos) {
        var titulo = normalizarTexto(datos.titulo_trabajo);

        if (!datos.clase_id || !datos.alumno_id || !titulo || !datos.ggb_base64) {
            throw new Error('Faltan datos requeridos.');
        }

        if (!getClasePorId(datos.clase_id)) {
            throw new Error('La clase indicada no existe.');
        }

        var trabajos = getTrabajos();

        var trabajo = {
            id: generarIdUnico(),
            clase_id: Number(datos.clase_id),
            alumno_id: Number(datos.alumno_id),
            titulo_trabajo: titulo,
            ggb_base64: datos.ggb_base64,
            fecha_entrega: new Date().toISOString()
        };

        trabajos.push(trabajo);

        if (!escribir(KEYS.trabajos, trabajos)) {
            throw new Error('No se pudo guardar el trabajo. Es posible que el almacenamiento del navegador esté lleno.');
        }

        notificarCambio('trabajos');
        return trabajo;
    }

    function guardarTrabajo(datos) {
        var titulo = normalizarTexto(datos.titulo_trabajo);

        if (!datos.clase_id || !datos.alumno_id || !titulo || !datos.ggb_base64) {
            return Promise.reject(new Error('Faltan datos requeridos.'));
        }

        if (!getClasePorId(datos.clase_id)) {
            return Promise.reject(new Error('La clase indicada no existe.'));
        }

        if (!nubeDisponible()) {
            return Promise.resolve().then(function () {
                return guardarTrabajoLocal(datos);
            });
        }

        var usuario = getUsuarios().find(function (item) {
            return Number(item.id) === Number(datos.alumno_id);
        });

        return window.GGS_CLOUD.guardarTrabajo({
            clase_id: Number(datos.clase_id),
            alumno_id: Number(datos.alumno_id),
            alumno_nombre: usuario ? usuario.nombre : 'Alumno',
            alumno_email: usuario ? usuario.email : '',
            titulo_trabajo: titulo,
            ggb_base64: datos.ggb_base64
        }).then(function (trabajo) {
            var trabajos = getTrabajos().filter(function (item) {
                return Number(item.id) !== Number(trabajo.id);
            });

            trabajos.push(trabajo);

            if (!escribir(KEYS.trabajos, trabajos)) {
                console.warn('El trabajo se guardó en el servidor JSON, pero no en la caché local.');
            }

            notificarCambio('trabajos');
            return trabajo;
        });
    }

    if (typeof window.addEventListener === 'function') {
        window.addEventListener('storage', function (evento) {
            if (evento.key === CLAVES_ANTERIORES.clases || evento.key === CLAVES_ANTERIORES.inscripciones) {
                migrarClavesAnteriores();
                notificarCambio('migracion');
            }
        });
    }

    inicializar();

    var promesaNube = getSesion() ? iniciarNube() : Promise.resolve(false);

    window.GGS_DB = {
        KEYS: KEYS,
        ready: promesaNube,
        nubeConfigurada: nubeConfigurada,
        nubeDisponible: nubeDisponible,
        sincronizarNube: sincronizarNube,
        getUsuarios: getUsuarios,
        registrar: registrar,
        login: login,
        getSesion: getSesion,
        renovarSesion: renovarSesion,
        logout: logout,
        cryptoDisponible: cryptoDisponible,
        getDiagnostico: getDiagnostico,
        getConfig: getConfig,
        guardarConfig: guardarConfig,
        getClases: getClases,
        getClasePorId: getClasePorId,
        getClasePorCodigo: getClasePorCodigo,
        getClasesDeProfesor: getClasesDeProfesor,
        crearClase: crearClase,
        eliminarClase: eliminarClase,
        getInscripciones: getInscripciones,
        estaInscripto: estaInscripto,
        unirseAClase: unirseAClase,
        getClasesDeAlumno: getClasesDeAlumno,
        getAlumnosDeClase: getAlumnosDeClase,
        getTrabajos: getTrabajos,
        getTrabajo: getTrabajo,
        getTrabajosDeAlumnoEnClase: getTrabajosDeAlumnoEnClase,
        guardarTrabajo: guardarTrabajo
    };
})();
