Import("bd.js");

function Import(file) {
    //source:http://www.forosdelweb.com/f13/importar-archivo-js-dentro-javascript-387358/
    document.write('<script language=\"JavaScript\" type=\"text/JavaScript\" src=' + file + '></script>');
}

var selectedBD;
var dbs;

BD.LoadAll().then((bds) => {

    dbs = bds;
    if (dbs.length == 0) {
        dbs = [new BD()];
        dbs[0].Init.then(_LoadBDS);
    } else _LoadBDS();

});


function _LoadBDS() {
    return new Promise((okey, error) => {
        var selector = document.getElementById("cmbBDs");


        for (i in dbs) {

            selector.appendChild(GetOption(dbs[i], i));
        }
        ChangeBD(0);
        okey();
    });
}

function GetOption(bd, i) {
    var option;
    option = document.createElement("option");
    option.setAttribute("value", i);
    option.innerHTML = bd.IdBD;
    return option;
}

function ChangeBD(index) {
    selectedBD = dbs[index];
    document.getElementById("hIdBD").innerHTML = selectedBD.IdBD;

}

function NewBD() {
    var bd = new BD();
    var cmbBD = document.getElementById("cmbBDs");
    bd.Init.then(() => {
        dbs.push(bd);
        cmbBD.appendChild(GetOption(bd, cmbBD.length));
        ChangeBD(cmbBD.length - 1);
    });
}

function ExecuteSQL() {
    var SQLSentence = document.getElementById("inpSQLSentence").value;
    var inpResult = document.getElementById("inpSQLResult");
    selectedBD.Execute(SQLSentence)
        .then((resultado) => {
            inpResult.value = "BD='" + selectedBD.IdBD + "' result:'" + resultado + "'";
        }).catch((error) => {
            inpResult.value = "BD='" + selectedBD.IdBD + "' error:'" + error + "'";
        });
}

function SaveAll() {
    BD.SaveAll(dbs).then(() => alert("Saved successfully")).catch(() => alert("Error on save BDS"));

}

function Save() {
    selectedBD.Save().then(() => alert("Saved successfully")).catch(() => alert("Error on save BD:" + selectedBD.IdBD));

}