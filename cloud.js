(function () {
    'use strict';

    var config = window.GGS_DB_CONFIG || {};
    var API_URL = String(config.API_URL || '').trim();
    var METODO_ESCRITURA = String(config.METODO_ESCRITURA || 'POST').toUpperCase();
    var TIMEOUT_MS = Number(config.TIMEOUT_MS) || 15000;
    var INTERVALO_MS = Number(config.INTERVALO_SINCRONIZACION_MS) || 60000;
    var MAX_BYTES = Number(config.MAX_BYTES) || 64000;
    var CABECERAS = config.CABECERAS && typeof config.CABECERAS === 'object' ? config.CABECERAS : {};

    var iniciado = false;
    var colaEscritura = Promise.resolve();
    var detenerEscucha = null;

    function configurado() {
        return /^https?:\/\//i.test(API_URL) &&
            API_URL.indexOf('TU_') === -1 &&
            API_URL.indexOf('REEMPLAZAR') === -1;
    }

    function disponible() {
        return configurado() && iniciado;
    }

    function iniciar() {
        if (!configurado() || typeof window.fetch !== 'function') {
            return Promise.resolve(false);
        }

        iniciado = true;
        return Promise.resolve(true);
    }

    function url() {
        return API_URL;
    }

    function normalizarCodigo(codigo) {
        return String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function normalizarEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function normalizarTexto(texto) {
        return String(texto === null || texto === undefined ? '' : texto).trim();
    }

    function numero(valor) {
        var convertido = Number(valor);
        return isFinite(convertido) ? convertido : 0;
    }

    function ahora() {
        return new Date().toISOString();
    }

    function nuevoId() {
        return Date.now() * 1000 + Math.floor(Math.random() * 1000);
    }

    function generarCodigo() {
        var caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var codigo = '';
        var i;
        var valores;

        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            valores = new Uint32Array(6);
            window.crypto.getRandomValues(valores);
            for (i = 0; i < 6; i++) {
                codigo += caracteres.charAt(valores[i] % caracteres.length);
            }
        } else {
            for (i = 0; i < 6; i++) {
                codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
            }
        }

        return codigo;
    }

    function crearError(mensaje, estado) {
        var error = new Error(mensaje);

        if (estado) {
            error.status = estado;
        }

        return error;
    }

    function normalizarError(error) {
        if (error && error.name === 'AbortError') {
            return crearError('El servidor JSON tardó demasiado en responder. Intentá de nuevo.');
        }

        if (error && error.status) {
            return error;
        }

        if (error instanceof TypeError && /fetch|network|failed|load/i.test(error.message)) {
            return crearError('No se pudo conectar con el servidor JSON. Revisá tu conexión a internet.');
        }

        return error instanceof Error ? error : crearError('Error de conexión con el servidor JSON.');
    }

    function normalizarAlumno(item, fechaDefecto) {
        var id = numero(item && typeof item === 'object' ?
            (item.id || item.alumnoId || item.alumno_id) : item);

        if (!id) {
            return null;
        }

        return {
            id: id,
            nombre: normalizarTexto(item && (item.nombre || item.alumnoNombre || item.alumno_nombre)),
            email: normalizarEmail(item && (item.email || item.alumnoEmail || item.alumno_email)),
            fecha: (item && (item.fecha || item.fechaInscripcion || item.fecha_inscripcion)) ||
                fechaDefecto || ahora()
        };
    }

    function normalizarAlumnos(datos, fechaDefecto) {
        var bruto = Array.isArray(datos.alumnosInscritos) ? datos.alumnosInscritos :
            (Array.isArray(datos.alumnos_inscritos) ? datos.alumnos_inscritos :
                (Array.isArray(datos.alumnos) ? datos.alumnos : []));
        var legado = Array.isArray(datos.alumnos_ids) ? datos.alumnos_ids : [];
        var vistos = {};
        var alumnos = [];

        function agregar(item) {
            var alumno = normalizarAlumno(item, fechaDefecto);

            if (!alumno || vistos[alumno.id]) {
                return;
            }

            vistos[alumno.id] = true;
            alumnos.push(alumno);
        }

        bruto.forEach(agregar);
        legado.forEach(agregar);
        return alumnos;
    }

    function normalizarClase(item, indice, inscripciones) {
        if (!item || typeof item !== 'object') {
            return null;
        }

        var id = numero(item.id || item.claseId || item.clase_id) || (Number(indice) + 1);
        var codigo = normalizarCodigo(
            item.codigoClase || item.codigo_clase || item.codigo_acceso || item.codigo
        );
        var fecha = item.fechaCreacion || item.fecha_creacion || item.creada_en || ahora();
        var alumnos = normalizarAlumnos(item, fecha);

        if (!codigo) {
            return null;
        }

        (Array.isArray(inscripciones) ? inscripciones : []).forEach(function (inscripcion) {
            if (numero(inscripcion.claseId || inscripcion.clase_id) !== id) {
                return;
            }

            var alumno = normalizarAlumno(inscripcion, inscripcion.fecha || fecha);

            if (alumno && !alumnos.some(function (existente) { return existente.id === alumno.id; })) {
                alumnos.push(alumno);
            }
        });

        return {
            id: id,
            profesor_id: numero(item.profesorId || item.profesor_id || item.profesor),
            profesor_nombre: normalizarTexto(item.profesorNombre || item.profesor_nombre) || 'Profesor',
            profesor_email: normalizarEmail(item.profesorEmail || item.profesor_email),
            nombre_clase: normalizarTexto(item.nombreClase || item.nombre_clase || item.nombre),
            tema: normalizarTexto(item.tema),
            codigo_acceso: codigo,
            alumnos_ids: alumnos.map(function (alumno) { return alumno.id; }),
            alumnos_inscritos: alumnos,
            creada_en: fecha,
            actualizada_en: item.actualizadaEn || item.actualizada_en || fecha
        };
    }

    function normalizarTrabajo(item, indice) {
        if (!item || typeof item !== 'object') {
            return null;
        }

        var claseId = numero(item.claseId || item.clase_id || item.idClase);
        var alumnoId = numero(item.alumnoId || item.alumno_id || item.idAlumno);

        if (!claseId || !alumnoId) {
            return null;
        }

        return {
            id: numero(item.id) || (Date.now() * 1000 + Number(indice)),
            clase_id: claseId,
            alumno_id: alumnoId,
            alumno_nombre: normalizarTexto(
                item.alumnoNombre || item.alumno_nombre || item.nombreAlumno
            ),
            alumno_email: normalizarEmail(
                item.alumnoEmail || item.alumno_email || item.emailAlumno
            ),
            titulo_trabajo: normalizarTexto(
                item.tituloTrabajo || item.titulo_trabajo || item.titulo
            ),
            ggb_base64: String(
                item.ggbBase64 || item.ggb_base64 || item.construccionGgb || item.base64 || ''
            ),
            fecha_entrega: item.fechaEntrega || item.fecha_entrega || item.fechaEnvio || ahora()
        };
    }

    function normalizarCodigos(bruto, clases) {
        var resultado = {};

        if (Array.isArray(bruto)) {
            bruto.forEach(function (item) {
                var codigo = normalizarCodigo(item && (item.codigoClase || item.codigo_clase || item.codigo));
                var claseId = numero(item && (item.claseId || item.clase_id || item.id));

                if (codigo && claseId) {
                    resultado[codigo] = claseId;
                }
            });
        } else if (bruto && typeof bruto === 'object') {
            Object.keys(bruto).forEach(function (codigo) {
                var claseId = numero(bruto[codigo]);
                var normalizado = normalizarCodigo(codigo);

                if (normalizado && claseId) {
                    resultado[normalizado] = claseId;
                }
            });
        }

        clases.forEach(function (clase) {
            if (clase.codigo_acceso) {
                resultado[clase.codigo_acceso] = clase.id;
            }
        });

        return resultado;
    }

    function inscripcionesDeClases(clases) {
        var inscripciones = [];

        clases.forEach(function (clase) {
            (clase.alumnos_inscritos || []).forEach(function (alumno) {
                inscripciones.push({
                    id: 'remoto_' + clase.id + '_' + alumno.id,
                    clase_id: clase.id,
                    alumno_id: alumno.id,
                    alumno_nombre: alumno.nombre,
                    alumno_email: alumno.email,
                    fecha: alumno.fecha
                });
            });
        });

        return inscripciones;
    }

    function normalizarDatos(bruto) {
        var datos = Array.isArray(bruto) ? { clases: bruto } :
            (bruto && typeof bruto === 'object' ? bruto : {});
        var inscripciones = Array.isArray(datos.inscripciones) ? datos.inscripciones : [];
        var clasesBrutas = Array.isArray(datos.clases) ? datos.clases : [];
        var clases = [];
        var trabajos = [];
        var trabajosVistos = {};

        function agregarTrabajo(item, claseId) {
            var entrada = item;

            if (entrada && typeof entrada === 'object' && claseId &&
                !entrada.claseId && !entrada.clase_id && !entrada.idClase) {
                entrada = {};

                Object.keys(item).forEach(function (clave) {
                    entrada[clave] = item[clave];
                });

                entrada.claseId = claseId;
            }

            var trabajo = normalizarTrabajo(entrada, trabajos.length);

            if (!trabajo) {
                return;
            }

            var clave = [
                trabajo.clase_id,
                trabajo.alumno_id,
                trabajo.titulo_trabajo,
                trabajo.fecha_entrega,
                String(trabajo.ggb_base64).slice(0, 48)
            ].join('|');

            if (trabajosVistos[clave]) {
                return;
            }

            trabajosVistos[clave] = true;
            trabajos.push(trabajo);
        }

        clasesBrutas.forEach(function (item, indice) {
            var clase = normalizarClase(item, indice, inscripciones);

            if (!clase) {
                return;
            }

            clases.push(clase);

            var entregas = Array.isArray(item.entregas) ? item.entregas :
                (Array.isArray(item.trabajos) ? item.trabajos : []);

            entregas.forEach(function (entrega) {
                agregarTrabajo(entrega, clase.id);
            });
        });

        (Array.isArray(datos.trabajos) ? datos.trabajos : []).forEach(function (item) {
            agregarTrabajo(item, 0);
        });

        (Array.isArray(datos.entregas) ? datos.entregas : []).forEach(function (item) {
            agregarTrabajo(item, 0);
        });

        return {
            version: 2,
            clases: clases,
            codigos: normalizarCodigos(datos.codigos, clases),
            trabajos: trabajos,
            inscripciones: inscripcionesDeClases(clases)
        };
    }

    function serializarAlumno(alumno) {
        return {
            id: numero(alumno.id),
            nombre: normalizarTexto(alumno.nombre),
            email: normalizarEmail(alumno.email),
            fecha: alumno.fecha || ahora()
        };
    }

    function serializarClase(clase) {
        var alumnos = Array.isArray(clase.alumnos_inscritos) ? clase.alumnos_inscritos :
            (Array.isArray(clase.alumnosInscritos) ? clase.alumnosInscritos : []);

        return {
            id: numero(clase.id),
            codigoClase: normalizarCodigo(clase.codigo_acceso || clase.codigoClase),
            nombreClase: normalizarTexto(clase.nombre_clase || clase.nombreClase),
            tema: normalizarTexto(clase.tema),
            profesorId: numero(clase.profesor_id || clase.profesorId),
            profesorNombre: normalizarTexto(clase.profesor_nombre || clase.profesorNombre) || 'Profesor',
            profesorEmail: normalizarEmail(clase.profesor_email || clase.profesorEmail),
            fechaCreacion: clase.creada_en || clase.fechaCreacion || ahora(),
            actualizadaEn: clase.actualizada_en || clase.actualizadaEn || ahora(),
            alumnosInscritos: alumnos.map(serializarAlumno).filter(function (alumno) {
                return !!alumno.id;
            }),
            entregas: []
        };
    }

    function serializarTrabajo(trabajo) {
        return {
            id: numero(trabajo.id),
            claseId: numero(trabajo.clase_id || trabajo.claseId),
            idAlumno: numero(trabajo.alumno_id || trabajo.alumnoId),
            nombreAlumno: normalizarTexto(trabajo.alumno_nombre || trabajo.alumnoNombre),
            emailAlumno: normalizarEmail(trabajo.alumno_email || trabajo.alumnoEmail),
            tituloTrabajo: normalizarTexto(trabajo.titulo_trabajo || trabajo.tituloTrabajo),
            construccionGgb: String(trabajo.ggb_base64 || trabajo.ggbBase64 || ''),
            fechaEnvio: trabajo.fecha_entrega || trabajo.fechaEntrega || ahora()
        };
    }

    function serializarDatos(datos) {
        var clases = (datos.clases || []).map(serializarClase).filter(function (clase) {
            return !!clase.id && !!clase.codigoClase;
        });
        var codigos = {};
        var inscripciones = [];

        clases.forEach(function (clase) {
            codigos[clase.codigoClase] = clase.id;

            clase.alumnosInscritos.forEach(function (alumno) {
                inscripciones.push({
                    claseId: clase.id,
                    codigoClase: clase.codigoClase,
                    alumnoId: alumno.id,
                    nombre: alumno.nombre,
                    email: alumno.email,
                    fecha: alumno.fecha
                });
            });
        });

        (datos.trabajos || []).map(serializarTrabajo).forEach(function (trabajo) {
            if (!trabajo.id) {
                return;
            }

            var clase = clases.find(function (item) {
                return item.id === trabajo.claseId;
            });

            if (clase) {
                clase.entregas.push(trabajo);
            }
        });

        return {
            version: 2,
            actualizadoEn: ahora(),
            clases: clases,
            codigos: codigos,
            inscripciones: inscripciones
        };
    }

    function fetchConTimeout(opciones) {
        var configuracion = opciones || {};
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var temporizador;

        if (controller) {
            configuracion.signal = controller.signal;
        }

        temporizador = window.setTimeout(function () {
            if (controller) {
                controller.abort();
            }
        }, TIMEOUT_MS);

        return window.fetch(API_URL, configuracion).then(function (respuesta) {
            window.clearTimeout(temporizador);
            return respuesta;
        }, function (error) {
            window.clearTimeout(temporizador);
            throw error;
        });
    }

    function verificarRespuesta(respuesta) {
        if (respuesta.ok) {
            return respuesta;
        }

        return respuesta.text().then(function (textoRespuesta) {
            var detalle = '';

            try {
                var datos = JSON.parse(textoRespuesta);
                detalle = datos && (datos.message || (datos.error && (datos.error.message || datos.error))) || '';
            } catch (error) {
                detalle = '';
            }

            throw crearError(
                'El servidor JSON respondió con error ' + respuesta.status +
                (detalle ? ': ' + detalle : '.'),
                respuesta.status
            );
        });
    }

    function leerRemoto() {
        return fetchConTimeout({
            method: 'GET',
            headers: Object.assign({ Accept: 'application/json' }, CABECERAS),
            cache: 'no-store'
        }).then(function (respuesta) {
            if (respuesta.status === 404) {
                return '';
            }

            return Promise.resolve(verificarRespuesta(respuesta)).then(function (valida) {
                return valida.text();
            });
        })
            .then(function (textoRespuesta) {
                if (!textoRespuesta || !textoRespuesta.trim()) {
                    return normalizarDatos({});
                }

                try {
                    return normalizarDatos(JSON.parse(textoRespuesta));
                } catch (error) {
                    throw crearError('El servidor devolvió un JSON inválido.');
                }
            })
            .catch(function (error) {
                throw normalizarError(error);
            });
    }

    function escribirRemoto(datos) {
        var cuerpo = serializarDatos(datos);
        var json = JSON.stringify(cuerpo);
        var bytes = typeof Blob !== 'undefined' ? new Blob([json]).size : json.length;

        if (bytes > MAX_BYTES) {
            return Promise.reject(crearError(
                'El JSON compartido supera el límite de ' + Math.round(MAX_BYTES / 1024) +
                ' KB del servidor. Reducí el tamaño de los trabajos o usá un almacenamiento mayor.'
            ));
        }

        return fetchConTimeout({
            method: METODO_ESCRITURA,
            headers: Object.assign({
                Accept: 'application/json',
                'Content-Type': 'application/json'
            }, CABECERAS),
            body: json
        }).then(verificarRespuesta)
            .then(function () {
                return datos;
            })
            .catch(function (error) {
                throw normalizarError(error);
            });
    }

    function enCola(tarea) {
        var ejecucion = colaEscritura.then(tarea, tarea);
        colaEscritura = ejecucion.catch(function () {});
        return ejecucion;
    }

    function mutarRemoto(mutador, verificar) {
        return enCola(function () {
            var intentos = 0;

            function intentar() {
                intentos += 1;

                return leerRemoto().then(function (datos) {
                    var resultado = mutador(datos);

                    if (!resultado || resultado.ok === false) {
                        return resultado;
                    }

                    return escribirRemoto(datos).then(function () {
                        if (typeof verificar !== 'function') {
                            return resultado;
                        }

                        return leerRemoto().then(function (confirmado) {
                            if (verificar(confirmado, resultado)) {
                                return resultado;
                            }

                            if (intentos >= 3) {
                                throw crearError('No se pudo confirmar el cambio en el servidor. Intentá de nuevo.');
                            }

                            return intentar();
                        });
                    });
                });
            }

            return intentar();
        });
    }

    function getTodosDatos() {
        if (!disponible()) {
            return Promise.reject(crearError('El servidor JSON no está configurado.'));
        }

        return leerRemoto().then(function (datos) {
            return {
                clases: datos.clases,
                inscripciones: datos.inscripciones,
                trabajos: datos.trabajos
            };
        });
    }

    function crearClase(datos) {
        if (!disponible()) {
            return Promise.reject(crearError('El servidor JSON no está configurado.'));
        }

        var claseId = nuevoId();

        return mutarRemoto(function (estado) {
            var existente = estado.clases.find(function (clase) {
                return clase.id === claseId;
            });

            if (existente) {
                return normalizarClase(existente, estado.clases.indexOf(existente), []);
            }

            var codigo = '';
            var intentos = 0;

            do {
                codigo = generarCodigo();
                intentos += 1;

                if (intentos > 20) {
                    throw crearError('No se pudo generar un código único. Intentá de nuevo.');
                }
            } while (estado.codigos[codigo] || estado.clases.some(function (clase) {
                return clase.codigo_acceso === codigo;
            }));

            var fecha = ahora();
            var clase = {
                id: claseId,
                profesor_id: numero(datos.profesor_id),
                profesor_nombre: normalizarTexto(datos.profesor_nombre) || 'Profesor',
                profesor_email: normalizarEmail(datos.profesor_email),
                nombre_clase: normalizarTexto(datos.nombre_clase),
                tema: normalizarTexto(datos.tema),
                codigo_acceso: codigo,
                alumnos_ids: [],
                alumnos_inscritos: [],
                creada_en: fecha,
                actualizada_en: fecha
            };

            estado.clases.push(clase);
            estado.codigos[codigo] = clase.id;

            return normalizarClase(clase, estado.clases.length - 1, []);
        }, function (confirmado, resultado) {
            return confirmado.clases.some(function (clase) {
                return clase.id === resultado.id;
            }) && confirmado.codigos[resultado.codigo_acceso] === resultado.id;
        });
    }

    function eliminarClase(claseId, profesorId) {
        if (!disponible()) {
            return Promise.resolve(false);
        }

        var id = numero(claseId);

        return mutarRemoto(function (estado) {
            var clase = estado.clases.find(function (item) {
                return item.id === id;
            });

            if (!clase || Number(clase.profesor_id) !== Number(profesorId)) {
                return false;
            }

            estado.clases = estado.clases.filter(function (item) {
                return item.id !== id;
            });

            delete estado.codigos[clase.codigo_acceso];

            estado.trabajos = estado.trabajos.filter(function (trabajo) {
                return Number(trabajo.clase_id) !== id;
            });

            return true;
        }, function (confirmado) {
            return !confirmado.clases.some(function (clase) {
                return clase.id === id;
            });
        });
    }

    function unirseAClase(codigo, alumno) {
        if (!disponible()) {
            return Promise.reject(crearError('El servidor JSON no está configurado.'));
        }

        var buscado = normalizarCodigo(codigo);
        var alumnoId = numero(alumno && alumno.id);
        var email = normalizarEmail(alumno && alumno.email);

        if (!buscado || !alumnoId) {
            return leerRemoto().then(function (datos) {
                return { ok: false, motivo: 'codigo', totalClases: datos.clases.length };
            });
        }

        return mutarRemoto(function (estado) {
            var claseId = estado.codigos[buscado];
            var clase = estado.clases.find(function (item) {
                return item.id === claseId;
            }) || estado.clases.find(function (item) {
                return item.codigo_acceso === buscado;
            });

            if (!clase) {
                return { ok: false, motivo: 'codigo', totalClases: estado.clases.length };
            }

            var duplicado = clase.alumnos_inscritos.some(function (item) {
                return item.id === alumnoId ||
                    (email && normalizarEmail(item.email) === email);
            });

            if (duplicado) {
                return {
                    ok: false,
                    motivo: 'duplicado',
                    clase: normalizarClase(clase, 0, [])
                };
            }

            var fecha = ahora();

            clase.alumnos_inscritos.push({
                id: alumnoId,
                nombre: normalizarTexto(alumno.nombre) || 'Alumno',
                email: email,
                fecha: fecha
            });
            clase.alumnos_ids = clase.alumnos_inscritos.map(function (item) {
                return item.id;
            });
            clase.actualizada_en = fecha;

            return {
                ok: true,
                clase: normalizarClase(clase, 0, [])
            };
        }, function (confirmado, resultado) {
            var clase = confirmado.clases.find(function (item) {
                return item.id === resultado.clase.id;
            });

            return !!clase && clase.alumnos_inscritos.some(function (item) {
                return item.id === alumnoId;
            });
        });
    }

    function guardarTrabajo(datos) {
        if (!disponible()) {
            return Promise.reject(crearError('El servidor JSON no está configurado.'));
        }

        var trabajoId = nuevoId();

        return mutarRemoto(function (estado) {
            var existente = estado.trabajos.find(function (trabajo) {
                return trabajo.id === trabajoId;
            });

            if (existente) {
                return normalizarTrabajo(existente, estado.trabajos.indexOf(existente));
            }

            var claseId = numero(datos.clase_id);

            if (!estado.clases.some(function (clase) { return clase.id === claseId; })) {
                throw crearError('La clase indicada no existe.');
            }

            var trabajo = {
                id: trabajoId,
                clase_id: claseId,
                alumno_id: numero(datos.alumno_id),
                alumno_nombre: normalizarTexto(datos.alumno_nombre) || 'Alumno',
                alumno_email: normalizarEmail(datos.alumno_email),
                titulo_trabajo: normalizarTexto(datos.titulo_trabajo),
                ggb_base64: String(datos.ggb_base64 || ''),
                fecha_entrega: ahora()
            };

            estado.trabajos.push(trabajo);
            return normalizarTrabajo(trabajo, estado.trabajos.length - 1);
        }, function (confirmado, resultado) {
            return confirmado.trabajos.some(function (trabajo) {
                return trabajo.id === resultado.id;
            });
        });
    }

    function importarDatos(datos) {
        if (!disponible()) {
            return Promise.reject(crearError('El servidor JSON no está configurado.'));
        }

        return enCola(function () {
            return leerRemoto().then(function (estado) {
                if (estado.clases.length) {
                    return false;
                }

                var inscripciones = Array.isArray(datos.inscripciones) ? datos.inscripciones : [];
                var clases = (datos.clases || []).map(function (clase, indice) {
                    var alumnos = [];

                    inscripciones.forEach(function (inscripcion) {
                        if (numero(inscripcion.clase_id || inscripcion.claseId) !== numero(clase.id)) {
                            return;
                        }

                        var alumno = normalizarAlumno({
                            id: inscripcion.alumno_id || inscripcion.alumnoId,
                            nombre: inscripcion.alumno_nombre || inscripcion.alumnoNombre,
                            email: inscripcion.alumno_email || inscripcion.alumnoEmail,
                            fecha: inscripcion.fecha
                        }, clase.creada_en || ahora());

                        if (alumno && !alumnos.some(function (existente) {
                            return existente.id === alumno.id;
                        })) {
                            alumnos.push(alumno);
                        }
                    });

                    (clase.alumnos_ids || []).forEach(function (alumnoId) {
                        var alumno = normalizarAlumno(alumnoId, clase.creada_en || ahora());

                        if (alumno && !alumnos.some(function (existente) {
                            return existente.id === alumno.id;
                        })) {
                            alumnos.push(alumno);
                        }
                    });

                    return normalizarClase({
                        id: clase.id,
                        profesor_id: clase.profesor_id,
                        profesor_nombre: clase.profesor_nombre,
                        profesor_email: clase.profesor_email,
                        nombre_clase: clase.nombre_clase,
                        tema: clase.tema,
                        codigo_acceso: clase.codigo_acceso,
                        creada_en: clase.creada_en,
                        alumnosInscritos: alumnos
                    }, indice, []);
                }).filter(Boolean);

                if (!clases.length) {
                    return false;
                }

                estado.clases = clases;
                estado.codigos = normalizarCodigos({}, clases);
                estado.trabajos = (datos.trabajos || []).map(normalizarTrabajo).filter(Boolean);

                return escribirRemoto(estado).then(function () {
                    return true;
                });
            });
        });
    }

    function detenerEscuchaActual() {
        if (typeof detenerEscucha === 'function') {
            detenerEscucha();
        }

        detenerEscucha = null;
    }

    function escucharCambios(callback) {
        detenerEscuchaActual();

        if (!disponible() || typeof callback !== 'function') {
            return detenerEscuchaActual;
        }

        var activo = true;
        var sincronizando = false;

        function sincronizar() {
            if (!activo || sincronizando || document.hidden) {
                return;
            }

            sincronizando = true;

            Promise.resolve()
                .then(callback)
                .catch(function (error) {
                    console.error('No se pudo sincronizar con el servidor JSON:', error);
                })
                .then(function () {
                    sincronizando = false;
                });
        }

        var temporizador = window.setInterval(sincronizar, INTERVALO_MS);

        function alVolver() {
            if (!document.hidden) {
                sincronizar();
            }
        }

        document.addEventListener('visibilitychange', alVolver);
        window.addEventListener('focus', alVolver);

        detenerEscucha = function () {
            activo = false;
            window.clearInterval(temporizador);
            document.removeEventListener('visibilitychange', alVolver);
            window.removeEventListener('focus', alVolver);
        };

        return detenerEscucha;
    }

    window.GGS_CLOUD = {
        configurado: configurado,
        disponible: disponible,
        iniciar: iniciar,
        url: url,
        getTodosDatos: getTodosDatos,
        crearClase: crearClase,
        eliminarClase: eliminarClase,
        unirseAClase: unirseAClase,
        guardarTrabajo: guardarTrabajo,
        importarDatos: importarDatos,
        escucharCambios: escucharCambios
    };
})();
