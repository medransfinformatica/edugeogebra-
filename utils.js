(function () {
    'use strict';

    function escapeHtml(valor) {
        return String(valor === null || valor === undefined ? '' : valor)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatFecha(iso) {
        if (!iso) {
            return '';
        }

        var fecha = new Date(iso);

        if (isNaN(fecha.getTime())) {
            return '';
        }

        function dosDigitos(numero) {
            return ('0' + numero).slice(-2);
        }

        return dosDigitos(fecha.getDate()) + '/' +
            dosDigitos(fecha.getMonth() + 1) + '/' +
            fecha.getFullYear() + ' ' +
            dosDigitos(fecha.getHours()) + ':' +
            dosDigitos(fecha.getMinutes());
    }

    function mostrarAlerta(contenedor, mensaje, tipo) {
        if (!contenedor) {
            return;
        }

        var tipoSeguro = ['success', 'warning', 'danger', 'info'].indexOf(tipo) !== -1 ? tipo : 'danger';
        var icono = tipoSeguro === 'success' ? 'fa-check-circle' :
            (tipoSeguro === 'warning' ? 'fa-info-circle' : 'fa-exclamation-circle');
        var alerta = document.createElement('div');
        var iconoElemento = document.createElement('i');

        contenedor.textContent = '';
        alerta.className = 'app-alert ' + tipoSeguro;
        iconoElemento.className = 'fas ' + icono + ' me-1';
        alerta.appendChild(iconoElemento);
        alerta.appendChild(document.createTextNode(' ' + String(mensaje || '')));
        contenedor.appendChild(alerta);
    }

    function escucharCambios(callback) {
        var pendiente = null;

        function programar() {
            if (pendiente) {
                return;
            }

            pendiente = window.setTimeout(function () {
                pendiente = null;
                callback();
            }, 60);
        }

        window.addEventListener('storage', programar);
        window.addEventListener('focus', programar);
        window.addEventListener('ggs:datachange', programar);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                programar();
            }
        });
    }

    window.GGS_UTILS = {
        escapeHtml: escapeHtml,
        formatFecha: formatFecha,
        mostrarAlerta: mostrarAlerta,
        escucharCambios: escucharCambios
    };
})();
