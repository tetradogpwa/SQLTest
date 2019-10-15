//source:https://coderwall.com/p/flonoa/simple-string-format-in-javascript
String.prototype.Format = function() {
    text = this;
    for (k in arguments) {
        text = text.Replace("{" + k + "}", arguments[k]);
    }
    return text;
}
String.prototype.Replace = function() {
    if (arguments.length < 2)
        throw "se necesitan dos argumentos, textoAEncontrar,reemplazarPor"
    text = this;
    while (text.includes(arguments[0])) {
        text = text.replace(arguments[0], arguments[1]);
    }
    return text;
}