﻿window._USER = "tetradogpwa";
window._APP = "SQLTest";
window._ROOTUTILS = "https://" + window._USER + ".github.io/Utils/";
window.Import = (url) => {

    var scriptNode;

    if (!window._MapImportScript)
        window._MapImportScript = new Map();
    //source:http://www.forosdelweb.com/f13/importar-archivo-js-dentro-javascript-387358/
    if (!window._MapImportScript.has(url)) {

        scriptNode = document.createElement("script");
        scriptNode.setAttribute("language", "JavaScript");
        scriptNode.setAttribute("type", "text/JavaScript");
        scriptNode.setAttribute("src", url);

        document.write(scriptNode.outerHTML);

        window._MapImportScript.set(url, url);
    }


};
window.Import(window._ROOTUTILS + "BDSql/bd.js");
window.Import(window._ROOTUTILS + "Utils/Utils.js");
window.Import("sw.js");


$(function () {
    const SQLSENTENCE = "sql sentence";
    const LASTINDEX = "last bd selected";
    const CLASS_TABLE = 'showTable';
    const URL_BD_TEST = "bdTest.sqlite";
    const TABLE = "table";


    if ('serviceWorker' in navigator) {

        navigator.serviceWorker.register('/' + window._APP + '/sw.js');

        BD.Header = "BD_" + window._APP;
        SetQuery(localStorage[SQLSENTENCE] != undefined ? localStorage[SQLSENTENCE] : "");

        $('#btnLoadBDTest').click(function () {
             BD.FromUrl('Test',URL_BD_TEST).then((bd)=> {
                return AddBD(bd).then(() => SetBD(window.BDs.length - 1));
            });
        });
        $('#btnRun').click(function () {
            window.BD.Execute(GetQuery()).then(SetResult);
        });
        $('#btnClear').click(function () {
            $('#txtIn').text('');
            $('#txtOut').text('');
        });
        //cargo las BDs guardadas
        window.BDs = [];
        BD.LoadAll().then((bds) => {
            //si no hay ninguna
            var promise;
            var index = localStorage[LASTINDEX] != undefined ? localStorage[LASTINDEX] : 0;
            if (bds.length == 0) {
                promise = AddBD(new BD());
            }
            else {
                promise = [];
                for (var i = 0; i < bds.length; i++) {
                    promise.push(AddBD(bds[i]));
                }
                promise = Promise.all(promise);
            }
            return promise.then(() => SetBD(index));

        }).then(() => $('#loader').hide());




    } else {
        $('.container').hide();
        alert('Navegador obsoleto');
    }
    function SetResult(result) {
        var txtResult = BD.ResultToString(result);
        //pongo 
        $('#txtOut').text(txtResult);
    }
    function GetQuery() {
        return $('#txtIn').text();
    }
    function SetBD(index) {
        if (index < 0 || index >= window.BDs.length) {
            console.error('index out of range!', index);
        } else {
            console.log('cargando tablas');
            //la BD actual es la que tenga el index
            window.BD = window.BDs[index];
            console.log(window.BD);
            //cargo las tablas y sus columnas en un desplegable
            $('#tablas').empty();
            return window.BD.Init.then(() => {
                return window.BD.GetTables().then(tablas => {
                    var promesasTablas = [];
                    console.log('tablas',tablas);
                    for (var i = 0; i < tablas.length; i++) {
                        promesasTablas.push(window.BD.GetColumns(tablas[i]).then(columnas => {
                            AddTable(tablas[i]);

                            for (var j = 0; j < columnas.length; j++) {
                                AddTableColumn(tablas[i], columnas[j]);
                            }


                        }));
                    }
                    return Promise.all(promesasTablas).then(() => {
                        //muestro el titulo
                        $('#lblNombreBD').innerText = window.BD.Name;
                        //guardo cual se ha puesto
                        localStorage[LASTINDEX] = index;
                    });

                });
            });
        }
    }
    function AddTable(table) {

        var idLbl = 'lbl' + table;
        var lstTabla = TABLE + table;

        $('#tablas').append('<div><label id="' + idLbl + '">' + table + '</label><ul id="' + lstTabla + '"></ul></div>');

        $('#' + idLbl).click(function () {

            var lstTabla = $('#' + lstTabla);
            if (lstTabla.hasClass(CLASS_TABLE)) {
                lstTabla.removeClass(CLASS_TABLE);
            } else {
                lstTabla.addClass(CLASS_TABLE);
            }
        });

    }
    function AddTableColumn(table, column) {
        $('#' + TABLE + table).append('<li>' + column + '</li>');
    }
    function AddBD(bd) {
        window.BDs.push(bd);

        return bd.Init.then(() => {
            //lo añado a la lista
            return bd.GetDescTables().then((desc) => console.log(bd.Name,desc));
        });
    }

    function SetQuery(query) {
        //pongo el texto donde toca
        $('#txtIn').text(query);
    }
});