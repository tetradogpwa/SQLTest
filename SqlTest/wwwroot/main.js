window._USER = "tetradogpwa";//tiene que ser el usuario/organización donde está el fork

window._ROOTUTILS = "https://" + window._USER + ".github.io/Utils/";

window.Import = (url) => {

    var scriptNode = document.createElement("script");
    scriptNode.setAttribute("language", "JavaScript");
    scriptNode.setAttribute("type", "text/JavaScript");
    scriptNode.setAttribute("src", url);
    if (!window._MapImportScript)
        window._MapImportScript = new Map();
    //source:http://www.forosdelweb.com/f13/importar-archivo-js-dentro-javascript-387358/
    if (!window._MapImportScript.has(url)) {
        document.write(scriptNode.outerHTML);
        window._MapImportScript.set(url, url);
    }
};


window.Import(window._ROOTUTILS + "BDSql/bd.js");
window.Import(window._ROOTUTILS + "Utils/Utils.js");

window.onload = async() => {
    console.log("Javascript init");
    window.BDList = new Map();
    await BD.LoadAll().then((bds) => {


        for (var i = 0; i < bds.length; i++) {
            console.log(bds[i].Name);
            window.BDList.set(bds[i].Name, bds[i]);
        }
        console.log("Javascript finish");
    });


}


function RunSQL(bdName, sqlCommand) {
    return GetBD(bdName).then((bd) => {

        return bd.Execute(sqlCommand);
        

    });
}
function GetNamesDB() {
    return Array.from(window.BDList.keys());
}
function CreateDBSQL(bdName) {

    var bd = new BD();
    return bd.Init.then(() => {
        bd.Name = bdName;
        window.BDList.set(bdName, bd);
    });
}
function CloneDBSQL(nameDB) {
    return GetBD(nameDB).then((bd) => {
        var clon = bd.Clone();
        return clon.Init.then(() => {
            window.BDList.set(clon.Name, clon);
            return clon.Name;
        });

    });
}
function RemoveDBSQL(nameDB) {
    return GetBD(nameDB).then(BD.DeleteFromCache);
}
function GetBD(nameDB) {
    return Promise.resolve(window.BDList.get(nameDB));
}
function SaveAll() {
    var names = GetNamesDB();
    for (var i = 0; i < names.length;i++) {
        GetBD(names[i]).then(bd => bd.Save());
    }
    
}