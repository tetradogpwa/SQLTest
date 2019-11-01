class StringUtils {
    //source:https://coderwall.com/p/flonoa/simple-string-format-in-javascript
    static Format(str, ...args) {
            args = ArrayUtils.Root(args);
            for (var k = 0; k < args.length; k++) {
                str = StringUtils.Replace(str, "{" + k + "}", args[k]);
            }
            return str;
        }
        //source:https://coderwall.com/p/flonoa/simple-string-format-in-javascript
    static Replace(str, oldText, newText) {
        while (str.includes(oldText)) {
            str = str.replace(oldText, newText);
        }
        return str;
    }

}
class ArrayUtils {

    //sirve para obtener la array original de un ...args pasado por argumento a un metodo
    static Root(args) {
        while (args instanceof Array && args.length == 1 && args[0] instanceof Array)
            args = args[0];
        return args;
    }

    static IndexOf(array, value) {
        return array.indexOf(value);
    }

    static Remove(array, value) {
        ArrayUtils.RemoveAt(array, ArrayUtils.IndexOf(array, value));
    }
    static RemoveAt(array, index) {
        array.splice(index, 1);
    }

    static InsertAt(array, index, value) {
        array.splice(index, 0, value);
    }
    static Add(array, value) {
        ArrayUtils.InsertAt(array, array.length - 1, value);
    }
    static Push(array, value) {
        ArrayUtils.InsertAt(array, 0, value);
    }
    static Peek(array) {
        var value = null;
        if (array.length > 0) {
            value = array[0];
        }
        return value;
    }
    static Pop(array) {
        var value = ArrayUtils.Peek(array);

        if (array.length > 0) {
            ArrayUtils.RemoveAt(array, 0);
        }
        return value;
    }

}



//https://stackoverflow.com/questions/14603205/how-to-convert-hex-string-into-a-bytes-array-and-a-bytes-array-in-the-hex-strin from crypto-js
class ByteArrayUtils {

    static ToByteArray(hexString) {
        for (var bytes = [], pos = 0; pos < hexString.length; pos += 2)
            bytes.push(parseInt(hexString.substr(pos, 2), 16));
        return bytes;
    }
    static ToHex(byteArray) {
        var current;
        var hex = [];

        for (var i = 0; i < byteArray.length; i++) {
            current = byteArray[i] < 0 ? byteArray[i] + 256 : byteArray[i];
            hex.push((current >>> 4).toString(16));
            hex.push((current & 0xF).toString(16));
        }
        return hex.join("");
    }
}

class NodeListUtils {

    static Count(list) {
        return list.length;
    }
    static GetAt(list, position) {
        return list.item(position);
    }
    static RemoveAt(list, position) {
        list.removeChild(NodeListUtils.GetAt(list, position));
    }
    static IndexOf(list, node) {
        return ArrayUtils.IndexOf(Array.from(list), node);
    }
    static Push(list, node) {
        list.appendChild(node);
    }
    static GetNodes(list) {
        return list.entries();
    }
    static Remove(list, node) {
        NodeListUtils.RemoveAt(list, NodeListUtils.IndexOf(list, node));
    }

    static Add(list, node) {
        if (NodeListUtils.Count(list) > 0)
            NodeListUtils.InsertAt(list, NodeListUtils.Count(list) - 1, node);
        else NodeListUtils.Push(list, node);
    }
    static AddRange(list, nodeArray) {
        for (var i = 0; i < nodeArray.length; i++)
            NodeListUtils.Add(list, nodeArray[i]);
    }
    static Clear(list) {
        while (list.lastChild) {
            list.removeChild(list.lastChild);
        }
    }
    static InsertAt(list, index, node) {
        var array = Array.from(list);
        ArrayUtils.InsertAt(array, index, node);
        NodeListUtils.Clear(list);
        NodeListUtils.AddRange(list, array);
    }



}


class SelectUtils {
    static SelectedIndex(select) {
        return select.selectedIndex;
    }
    static GetAt(select, position) {
        return select.options[position];
    }
    static Count(select) {
        return select.options.length;
    }
    static RemoveAt(select, position) {
        NodeListUtils.RemoveAt(select.options, position);
    }
    static Add(select, value, innerText) {
        var option = SelectUtils.GetOption(value, innerText);
        select.options.add(option);
        return option;
    }
    static Push(select, value, innerText) {
        var option = SelectUtils.GetOption(value, innerText);
        NodeListUtils.Push(select.options, option);
        return option;
    }
    static GetOption(value, innerText) {
        var option = document.createElement("option");
        option.setAttribute("value", value);
        option.innerText = innerText;
        return option;
    }

    static FindPositions(select, value) {
        var posiciones = [];
        for (var i = 0, f = SelectUtils.Count(select); i < f; i++)
            if (SelectUtils.GetAt(select, i).value == value)
                ArrayUtils.Add(posiciones, i);
        return posiciones;
    }
    static Remove(select, value) {
        var posiciones = SelectUtils.FindPositions(select, value);

        for (var i = 0; i < posiciones.length; i++)
            SelectUtils.RemoveAt(select, posiciones[i]);
    }

}
class CacheUtils {

    static Set(nombreCache, key, value) {
        return CacheUtils.Remove(nombreCache, key).finally(() => {
            return caches.open(nombreCache).then((cache) => {

                return cache.put((key instanceof Request) ? key : new Request(key), (value instanceof Response) ? value : new Response(value));


            });
        });
    }
    static SetByteArray(nombreCache, key, arrayBytes) {
        return CacheUtils.SetString(nombreCache, key, (arrayBytes instanceof Response) ? arrayBytes : ByteArrayUtils.ToHex(arrayBytes), "text/plain");
    }
    static SetCss(nombreCache, key, strCss) {
        return CacheUtils.SetString(nombreCache, key, strCss, "text/css");
    }
    static SetJson(nombreCache, key, strCss) {
        return CacheUtils.SetString(nombreCache, key, strCss, "application/json");
    }

    static SetString(nombreCache, key, string, typeData = "text/plain") {
            return CacheUtils.Set(nombreCache, key, string instanceof Response ? string : new Response(string, { headers: { "Content-Type": typeData } }));
        }
        //hacer más tipos :D
    static Get(nombreCache, key) {

        return caches.open(nombreCache).then(cache => {

            return cache.match((key instanceof Request) ? key : new Request(key));
        });


    }
    static GetJson(nombreCache, key) {
        return CacheUtils.Get(nombreCache, key).then((j) => j.json());
    }
    static GetCss(nombreCache, key) {
        return CacheUtils.GetString(nombreCache, key);
    }
    static GetString(nombreCache, key) {
        return CacheUtils.Get(nombreCache, key).then((result) => result.text());
    }

    static GetByteArray(nombreCache, key) {
        return CacheUtils.GetString(nombreCache, key).then((str) => ByteArrayUtils.ToByteArray(str));

    }

    static Remove(nombreCache, key) {
        return CacheUtils.Delete(nombreCache, key);
    }
    static Delete(nombreCache, key) {
        return caches.open(nombreCache).then((cache) => cache.delete((key instanceof Request) ? key : new Request(key)));
    }

    static GetKeysRequest(nombreCache, toInclude = "") {
        return caches.open(nombreCache).then((cache) => cache.keys()).then((keys) => {
            for (var i = keys.length - 1; i >= 0; i--) {
                if (!String(keys[i].url).includes(toInclude)) {
                    ArrayUtils.RemoveAt(keys, i);
                }
            }
            return keys;
        });
    }
    static GetKeys(nombreCache, toInclude = "") {
        return CacheUtils.GetKeysRequest(nombreCache, toInclude).then((keys) => {
            var keysEnLimpio = [];
            var camposKey;
            for (var i = 0; i < keys.length; i++) {
                camposKey = String(keys[i].url).split('/');
                ArrayUtils.Add(keysEnLimpio, camposKey[camposKey.length - 1]);
            }
            return keysEnLimpio;
        });
    }




}

class IndexedDBUtils {


    static IsCompatible() {
        var compatible;
        if (windows.indexedDB)
            compatible = true;
        else compatible = false;

        return compatible;
    }

    static Open(ObjToSaveObj, SaveObjToObj, GetAuxObj, OldToNewObj, nameBD = "BD") {
        return new Promise((okey, error) => {
            var aux = GetAuxObj();
            var nameCollection = aux.getClassName();
            var keyCollection = nameBD + nameCollection;
            var request;
            IndexedDBUtils._Init();
            //si existiese la cierro
            if (IndexedDBUtils._ObjInit.has(keyCollection)) {
                IndexedDBUtils._ObjInit.remove(keyCollection);
                if (IndexedDBUtils._bds.has(keyCollection)) {
                    IndexedDBUtils._bds.get(keyCollection).close();
                    IndexedDBUtils._bds.remove(keyCollection);
                }
            }

            IndexedBDUtils._GetVersion(aux, nameBD).then((version) => {

                IndexedDBUtils._ObjInit.add(keyCollection, {
                    ObjToSaveObj: ObjToSaveObj,
                    SaveObjToObj: SaveObjToObj,
                    GetAuxObj: GetAuxObj,
                    OldToNewObj,
                    OldToNewObj,
                    NameBD: nameBD,
                    Collection: nameCollection,
                    Version: version

                });
                request = window.indexedBD.open(name, version);
                request.onupdateneeded = (bd) => {
                    try {
                        IndexedDBUtils._bds.add(keyCollection, bd);
                        //realizo la actualizacion tengo en cuenta el nombre de la propiedad porque alli vienen las opciones
                        okey([nameBD, nameCollection]);
                    } catch (ex) {
                        error(ex);
                    }
                };
            });


            if (IndexedDBUtils._bdsInit.has(keyCollection))
                IndexedDBUtils._bdsInit.remove(keyCollection);
            //mirar la forma de hacerlo :)    
            //  IndexedDBUtils._bdsInit.add(keyCollection, openPromise);


        });


    }
    static _Init() {
        if (!IndexedDBUtils._ObjInit) {
            IndexedDBUtils._ObjInit = new Map();

            IndexedDBUtils._bdsInit = new Map();

            IndexedDBUtils._bds = new Map();
            //Open TableName NameBD
        }
    }
    static _GetVersion(objAux, nameBD = "BD") {
        return new Promise((okey, error) => {
            var nameCollection = objAux.getClassName();
            var keyCollection = nameBD + nameCollection;
        });
    }
    static GetByIdOrKeyPath(idOrKeyPath, nameBD = "BD") {
        return IndexedDBUtils.Get(idOrKeyPath, "TableName", "NameBD").then((nameSaved) => IndexedDBUtils.Get(idOrKeyPath, nameSaved.Name, nameBD));
    }
    static Get(idOrKeyPath, GetAuxObj, nameBD = "BD") {

    }
    static GetAll(GetAuxObj, nameBD = "BD") {

    }
    static Add(obj, nameBD = "BD") {
        return IndexedDBUtils._ComunAddRemove(obj, nameBD, IndexedDBUtils.Add, (objToSave, tableName) => {

        });



    }
    static Remove(obj, nameBD = "BD") {
        return IndexedDBUtils._ComunAddRemove(obj, nameBD, IndexedDBUtils.Remove, (objToSave, tableName) => {

        });

    }
    static _ComunAddRemove(obj, nameBD, metodoTableName, metodoAddOrRemove) {
        return new Promise((okey, error) => {
            var nameCollection = obj.getClassName();
            var keyCollection = nameBD + nameCollection;
            var open;

            if (!IndexedDBUtils._ObjInit && !IndexedDBUtils._ObjInit.has(keyCollection)) {
                if (!IndexedDBUtils._bds && !IndexedDBUtils._bds.has(keyCollection))
                    error("First at all you need to Open BD");
                else {
                    bd = IndexedDBUtils._bds.get(keyCollection);
                    open = IndexedDBUtils.Open(bd.ObjToSaveObj, bd.SaveObjToObj, bd.GetAuxObj, bd.OldToNewObj, bd.NameBD);
                }
            } else {
                bd = IndexedDBUtils._bds.get(keyCollection);
                open = IndexedDBUtils._bdsInit.get(keyCollection);
            }
            open.then(() => {

                objToSave = bd.ObjToSaveObj(obj);
                if (collectionName != "TableName")
                    promesa = metodoTableName(new TableName(
                        objToSave.Id,
                        collectionName

                    ), "NameBD");
                else {
                    promesa = new Promise((okey, error) => okey());
                }
                promesa.then(() => {
                    //añado o elimino
                    metodoAddOrRemove(objToSave, nameBD);
                    okey([obj, nameBD]);
                }).catch(error);
            });
            //añado la promsea a la lista de promesas
            if (!bd._promises)
                bd._promises = [];
            //mirar forma de añadir objeto
            //ArrayUtils.Add(bd._promises,this);  



        });

    }
    static AddRange(arrayObj, nameBD = "BD") {
        return IndexedDBUtils._ComunRemoveAddRange(IndexedDBUtils.Add, arrayObj, nameBD);
    }
    static RemoveRange(arrayObj, nameBD = "BD") {
        return IndexedDBUtils._ComunRemoveAddRange(IndexedDBUtils.Remove, arrayObj, nameBD);
    }
    static _ComunRemoveAddRange(metodoAddORemove, arrayObj, nameBD) {
        var promises = [];
        for (var i = 0; i < arrayOBj.length; i++)
            ArrayUtils(promises, metodoAddORemove(arrayObj[i], nameBD));
        return Promise.all(promises);
    }

    static Clear(GetAuxObj, nameBD = "BD") {

    }
    static ClearAll(nameBD = "BD") {

    }

    static Close(GetAuxObj, nameBD = "BD") {

    }
    static CloseAll() {

    }


}
class TableName {
    constructor(id, name) {
        this._id = id;
        this._name = name;
    }
    get Name() {
        return this._name;
    }
    get Id() {
        return this._id;
    }
}




function DownloadFile(name, data, typeData) {
    var blob = new Blob([data], { type: typeData });
    var link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = name;
    link.click();
}
//https://stackoverflow.com/questions/332422/get-the-name-of-an-objects-type
Object.prototype.getClassName = function() {
    var funcNameRegex = /function (.{1,})\(/;
    var results = (funcNameRegex).exec((this).constructor.toString());
    return (results && results.length > 1) ? results[1] : "";
};

//https://stackoverflow.com/questions/3199588/fastest-way-to-convert-javascript-nodelist-to-array
NodeList.prototype.forEach = Array.prototype.forEach;
//https://stackoverflow.com/questions/3387427/remove-element-by-id
Element.prototype.remove = function() {
    this.parentElement.removeChild(this);
}
NodeList.prototype.remove = HTMLCollection.prototype.remove = function() {
    for (var i = this.length - 1; i >= 0; i--) {
        if (this[i] && this[i].parentElement) {
            this[i].parentElement.removeChild(this[i]);
        }
    }
}