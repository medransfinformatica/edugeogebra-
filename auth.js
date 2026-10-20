(function () {
    'use strict';

    function inicioSegunRol(rol) {
        if (rol === 'administrador') {
            return './configuracion.html';
        }
        if (rol === 'profesor') {
            return './panel_profesor.html';
        }
        return './panel_alumno.html';
    }

    function requerir(rolesPermitidos) {
        var sesion = GGS_DB.getSesion();

        if (!sesion) {
            window.location.replace('./index.html');
            return null;
        }

        if (rolesPermitidos && rolesPermitidos.length && rolesPermitidos.indexOf(sesion.rol) === -1) {
            window.location.replace(inicioSegunRol(sesion.rol));
            return null;
        }

        return sesion;
    }

    function salir() {
        GGS_DB.logout();
        window.location.replace('./index.html');
    }

    function renderNav(activo) {
        var contenedor = document.getElementById('app-navbar');
        var sesion = GGS_DB.getSesion();

        if (!contenedor || !sesion) {
            return;
        }

        var config = GGS_DB.getConfig();
        var nombreSistema = config.nombre_sistema || 'GeoGebra School';
        var esAdmin = sesion.rol === 'administrador';
        var esProfe = sesion.rol === 'profesor';
        var inicio = inicioSegunRol(sesion.rol);
        var claseRol = esAdmin || esProfe ? 'profe' : 'alumno';
        var etiquetaRol = esAdmin ? 'Admin' : (esProfe ? 'Profe' : 'Alumno');
        var iconoRol = esAdmin ? 'fa-crown' : (esProfe ? 'fa-chalkboard-teacher' : 'fa-graduation-cap');
        var enlaceMenu;

        if (esAdmin) {
            enlaceMenu = '<li class="nav-item"><a class="nav-link' +
                (activo === 'configuracion' ? ' active' : '') +
                '" href="./configuracion.html"><i class="fas fa-cog"></i> Configuración</a></li>';
        } else if (esProfe) {
            enlaceMenu = '<li class="nav-item"><a class="nav-link' +
                (activo === 'panel_profesor' ? ' active' : '') +
                '" href="./panel_profesor.html"><i class="fas fa-chalkboard"></i> Mis Clases</a></li>';
        } else {
            enlaceMenu = '<li class="nav-item"><a class="nav-link' +
                (activo === 'panel_alumno' ? ' active' : '') +
                '" href="./panel_alumno.html"><i class="fas fa-home"></i> Mis Clases</a></li>';
        }

        contenedor.innerHTML =
            '<nav class="navbar navbar-expand-lg navbar-futura">' +
                '<div class="container-fluid">' +
                    '<a class="navbar-brand" href="' + inicio + '">' +
                        '<i class="fas fa-cube"></i> ' + GGS_UTILS.escapeHtml(nombreSistema) +
                    '</a>' +
                    '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#menuNav"' +
                        ' style="border-color:rgba(0,242,255,0.2);color:#00f2ff;" aria-controls="menuNav" aria-expanded="false" aria-label="Abrir menú">' +
                        '<i class="fas fa-bars"></i>' +
                    '</button>' +
                    '<div class="collapse navbar-collapse" id="menuNav">' +
                        '<ul class="navbar-nav me-auto mb-2 mb-lg-0">' + enlaceMenu + '</ul>' +
                        '<div class="d-flex align-items-lg-center gap-2 flex-wrap">' +
                            '<div class="user-info">' +
                                '<div class="avatar-icon"><i class="fas fa-user"></i></div>' +
                                '<span>' + GGS_UTILS.escapeHtml(sesion.nombre) + '</span>' +
                                '<span class="badge-rol-nav ' + claseRol + '">' +
                                    '<i class="fas ' + iconoRol + '"></i> ' + etiquetaRol +
                                '</span>' +
                            '</div>' +
                            '<button type="button" id="btn-logout-nav" class="btn-logout">' +
                                '<i class="fas fa-sign-out-alt"></i> Salir' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</nav>';

        document.getElementById('btn-logout-nav').addEventListener('click', salir);
    }

    window.GGS_LAYOUT = {
        requerir: requerir,
        salir: salir,
        renderNav: renderNav,
        inicioSegunRol: inicioSegunRol
    };

    if (!GGS_DB.cryptoDisponible()) {
        var avisoCripto = document.createElement('div');
        avisoCripto.className = 'app-alert danger';
        avisoCripto.style.margin = '1rem';
        avisoCripto.textContent = 'No se pudo cargar CryptoJS. La plataforma no puede cifrar ni guardar datos de forma segura. Revisá la conexión y recargá la página.';
        document.body.insertBefore(avisoCripto, document.body.firstChild);
    }

    var sesionActiva = GGS_DB.getSesion();

    if (sesionActiva) {
        var ultimaRenovacion = 0;

        function renovarActividad() {
            var ahora = Date.now();

            if (ahora - ultimaRenovacion < 60000) {
                return;
            }

            ultimaRenovacion = ahora;

            if (!GGS_DB.renovarSesion()) {
                window.location.replace('./index.html');
            }
        }

        ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(function (evento) {
            window.addEventListener(evento, renovarActividad, { passive: true });
        });

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && !GGS_DB.getSesion()) {
                window.location.replace('./index.html');
            }
        });

        window.setInterval(function () {
            if (!GGS_DB.getSesion()) {
                window.location.replace('./index.html');
            }
        }, 60000);
    }
})();
