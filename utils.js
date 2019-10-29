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
        return caches.open(nombreCache).then((cache) => {

            cache.put((key instanceof Request) ? key : new Request(key), (value instanceof Response) ? value : new Response(value));


        });
    }
    static SetByteArray(nombreCache, key, arrayBytes, typeData = "application/octet-stream") {
        return CacheUtils.Set(nombreCache, key, (arrayBytes instanceof Response || arrayBytes instanceof Blob) ? arrayBytes : new Blob(arrayBytes, { type: typeData }));
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
        return CacheUtils.Get(nombreCache, key).then((result) => result.blob()).then((b) => b.arrayBuffer());

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

function DownloadFile(name, data, typeData) {
    var blob = new Blob([data], { type: typeData });
    var link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = name;
    link.click();
}
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