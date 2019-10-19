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