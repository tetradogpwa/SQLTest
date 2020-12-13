window._USER = "tetradogpwa";
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
    const URL_BD_TEST="bdTest.sqlite";
    const TABLE="table";


    if ('serviceWorker' in navigator) {

        navigator.serviceWorker.register('/' + window._APP + '/sw.js');

        BD.Header = "BD_SQLTester";
        SetQuery(localStorage[SQLSENTENCE] != undefined ? localStorage[SQLSENTENCE] : "");

        $('#btnLoadBDTest').click(function () {
            fetch(URL_BD_TEST).then((b) => b.blob()).then((bdTest) => {
                var bd = new BD();
                bd.Name = "Test";
                bd.Init = bd.Init.then((bd) => bd.Import(bdTest));
                AddBD(bd);
            });
        });
        $('#btnRun').click(function () {
            window.BD.Execute(GetQuery()).then(SetResult);
        });
        $('#btnClear').click(function () {
            $('#txtIn').val('');
            $('#txtOut').val('');
        });
        //cargo las BDs guardadas
        window.BDs = [];
        BD.LoadAll().then((bds) => {
            $('#loader').hide();
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

        });




    } else {
        $('.container').hide();
        alert('Navegador obsoleto');
    }
    function SetResult(result) {
        var txtResult = BD.ResultToString(result);
        //pongo 
        $('#txtOut').val(txtResult);
    }
    function GetQuery() {
        return $('#txtIn').val();
    }
    function SetBD(index) {
        var tablas;
        var columnas;
        //la BD actual es la que tenga el index
        window.BD = window.BDs[index];
        //cargo las tablas y sus columnas en un desplegable
        $('#tablas').empty();
        return window.BD.Init.then(() => {
            tablas = window.BD.GetTables();

            for (var i = 0; i < tablas.length; i++) {
                columnas = window.BD.GetColumns(tablas[i]);
                AddTable(tablas[i]);
                for (var j = 0; j < columnas.length; j++) {
                    AddTableColumn(tablas[i], columnas[j]);
                }
            }
            //muestro el titulo
            $('#lblNombreBD').innerText = window.BD.Name;
            //guardo cual se ha puesto
            localStorage[LASTINDEX] = index;
        });
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
        });
    }

    function SetQuery(query) {
        //pongo el texto donde toca
        $('#txtIn').val(query);
    }
});