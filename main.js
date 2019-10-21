Import("bd.js");
Import("sw.js");

function Import(file) {
    //source:http://www.forosdelweb.com/f13/importar-archivo-js-dentro-javascript-387358/
    document.write('<script language=\"JavaScript\" type=\"text/JavaScript\" src=' + file + '></script>');
}

const SQLSENTENCE = "sqlSentence";
const sqlVar = "inpSQLSentence";
const resultVar = "inpSQLResult";
const cmbVar = "cmbBDs";
var dbs;

window.onload = () => {

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/SQLTest/sw.js');
    }

    BD.LoadAll().then((bds) => {

        dbs = bds;
        if (dbs.length == 0) {
            dbs = [new BD()];
            dbs[0].Init.then(_LoadBDS);
        } else _LoadBDS();

    });

};

function GetSelectedBD() {
    return dbs.length > 0 ? dbs[document.getElementById(cmbVar).selectedIndex] : null;
}

function _LoadBDS() {
    return new Promise((okey, error) => {

        var elements;

        this.LoadCmb().then(() => {
            this.ChangeBD(0);

            document.getElementById(sqlVar).value = localStorage.getItem(SQLSENTENCE);
            document.getElementById("loader").remove();
            elements = document.getElementsByClassName("unloaded");

            for (var i = 0; i < elements.length; i++) {
                console.log(elements[i]);
                elements[i].classList.remove("unloaded");
                console.log("removed :)");
            }

            okey();
        });
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
    return new Promise((okey, error) => {
        document.getElementById(cmbVar).selectedIndex = index;
        okey();
    });

}

function NewBD() {
    return this.SetNewBD(new BD());
}

function CloneBD() {
    if (this.GetSelectedBD() != null)
        this.GetSelectedBD().Clone().then(this.SetNewBD);
    else alert("Please select one first");
}

function SetNewBD(bd) {
    return bd.Init.then(() => {
        dbs.push(bd);
        return this.LoadCmb().then(() => this.ChangeBD(dbs.length - 1));
    });
}

function LoadCmb() {
    var cmbBD = document.getElementById(cmbVar);
    return new Promise((okey, error) => {
        cmbBD.childNodes.remove();
        for (i in dbs) {

            cmbBD.appendChild(this.GetOption(dbs[i], i));
        }
    });
}

function DeleteBD() {
    var found = false;
    var i;
    var selector;
    var selectedBD = this.GetSelectedBD();
    var opcion;
    if (selectedBD != null) {
        this.DisableButtons();
        for (i = 0; i < dbs.length && !found; i++) {
            found = selectedBD.IdBD == dbs[i].IdBD;
        }
        i--;

        localStorage.removeItem(selectedBD.IdBD);
        dbs.splice(i);

        if (dbs.length == 0)
            opcion = this.NewBD();
        else opcion = this.LoadCmb().then(() => this.ChangeBD(0));
        opcion.then(() => this.EnableButtons());
    } else alert("Please select one first");
}

function ChangeButtons(status) {
    var buttons = document.getElementsByTagName("button");
    for (var i = 0; i < buttons.length; i++)
        buttons[i].disabled = status;
}

function DisableButtons() {
    this.ChangeButtons(false);
}

function EnableButtons() {
    this.ChangeButtons(true);
}

function Clear() {
    document.getElementById(sqlVar).value = "";
    localStorage.removeItem(SQLSENTENCE);
}

function ExecuteSQL() {
    var SQLSentence = document.getElementById(sqlVar).value;
    var inpResult = document.getElementById(resultVar);
    if (this.GetSelectedBD() != null) {
        this.GetSelectedBD().Execute(SQLSentence)
            .then((resultado) => {

                inpResult.value = "BD='" + this.GetSelectedBD().IdBD + "' result:'" + BD.ResultToString(resultado) + "'";
                localStorage.setItem(SQLSENTENCE, SQLSentence);
            }).catch((error) => {
                inpResult.value = "BD='" + this.GetSelectedBD().IdBD + "' '" + error + "'";
            });
    } else alert("Please select one first");
}

function SaveAll() {
    BD.SaveAll(dbs).then(() => alert("Saved successfully")).catch(() => alert("Error on save BDS"));

}

function Save() {
    if (this.GetSelectedBD() != null)
        this.GetSelectedBD().Save().then(() => alert("Saved successfully")).catch(() => alert("Error on save BD:" + this.GetSelectedBD().IdBD));
    else alert("Please select one first");
}