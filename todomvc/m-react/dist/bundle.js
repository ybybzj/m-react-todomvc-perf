require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            currentQueue[queueIndex].run();
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],2:[function(require,module,exports){
var isArray = require(3);

/**
 * Expose `pathToRegexp`.
 */
module.exports = pathToRegexp;

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
var PATH_REGEXP = new RegExp([
  // Match escaped characters that would otherwise appear in future matches.
  // This allows the user to escape special characters that won't transform.
  '(\\\\.)',
  // Match Express-style parameters and un-named parameters with a prefix
  // and optional suffixes. Matches appear as:
  //
  // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?"]
  // "/route(\\d+)" => [undefined, undefined, undefined, "\d+", undefined]
  '([\\/.])?(?:\\:(\\w+)(?:\\(((?:\\\\.|[^)])*)\\))?|\\(((?:\\\\.|[^)])*)\\))([+*?])?',
  // Match regexp special characters that are always escaped.
  '([.+*?=^!:${}()[\\]|\\/])'
].join('|'), 'g');

/**
 * Escape the capturing group by escaping special characters and meaning.
 *
 * @param  {String} group
 * @return {String}
 */
function escapeGroup (group) {
  return group.replace(/([=!:$\/()])/g, '\\$1');
}

/**
 * Attach the keys as a property of the regexp.
 *
 * @param  {RegExp} re
 * @param  {Array}  keys
 * @return {RegExp}
 */
function attachKeys (re, keys) {
  re.keys = keys;
  return re;
}

/**
 * Get the flags for a regexp from the options.
 *
 * @param  {Object} options
 * @return {String}
 */
function flags (options) {
  return options.sensitive ? '' : 'i';
}

/**
 * Pull out keys from a regexp.
 *
 * @param  {RegExp} path
 * @param  {Array}  keys
 * @return {RegExp}
 */
function regexpToRegexp (path, keys) {
  // Use a negative lookahead to match only capturing groups.
  var groups = path.source.match(/\((?!\?)/g);

  if (groups) {
    for (var i = 0; i < groups.length; i++) {
      keys.push({
        name:      i,
        delimiter: null,
        optional:  false,
        repeat:    false
      });
    }
  }

  return attachKeys(path, keys);
}

/**
 * Transform an array into a regexp.
 *
 * @param  {Array}  path
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function arrayToRegexp (path, keys, options) {
  var parts = [];

  for (var i = 0; i < path.length; i++) {
    parts.push(pathToRegexp(path[i], keys, options).source);
  }

  var regexp = new RegExp('(?:' + parts.join('|') + ')', flags(options));
  return attachKeys(regexp, keys);
}

/**
 * Replace the specific tags with regexp strings.
 *
 * @param  {String} path
 * @param  {Array}  keys
 * @return {String}
 */
function replacePath (path, keys) {
  var index = 0;

  function replace (_, escaped, prefix, key, capture, group, suffix, escape) {
    if (escaped) {
      return escaped;
    }

    if (escape) {
      return '\\' + escape;
    }

    var repeat   = suffix === '+' || suffix === '*';
    var optional = suffix === '?' || suffix === '*';

    keys.push({
      name:      key || index++,
      delimiter: prefix || '/',
      optional:  optional,
      repeat:    repeat
    });

    prefix = prefix ? ('\\' + prefix) : '';
    capture = escapeGroup(capture || group || '[^' + (prefix || '\\/') + ']+?');

    if (repeat) {
      capture = capture + '(?:' + prefix + capture + ')*';
    }

    if (optional) {
      return '(?:' + prefix + '(' + capture + '))?';
    }

    // Basic parameter support.
    return prefix + '(' + capture + ')';
  }

  return path.replace(PATH_REGEXP, replace);
}

/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 *
 * @param  {(String|RegExp|Array)} path
 * @param  {Array}                 [keys]
 * @param  {Object}                [options]
 * @return {RegExp}
 */
function pathToRegexp (path, keys, options) {
  keys = keys || [];

  if (!isArray(keys)) {
    options = keys;
    keys = [];
  } else if (!options) {
    options = {};
  }

  if (path instanceof RegExp) {
    return regexpToRegexp(path, keys, options);
  }

  if (isArray(path)) {
    return arrayToRegexp(path, keys, options);
  }

  var strict = options.strict;
  var end = options.end !== false;
  var route = replacePath(path, keys);
  var endsWithSlash = path.charAt(path.length - 1) === '/';

  // In non-strict mode we allow a slash at the end of match. If the path to
  // match already ends with a slash, we remove it for consistency. The slash
  // is valid at the end of a path match, not in the middle. This is important
  // in non-ending mode, where "/test/" shouldn't match "/test//route".
  if (!strict) {
    route = (endsWithSlash ? route.slice(0, -2) : route) + '(?:\\/(?=$))?';
  }

  if (end) {
    route += '$';
  } else {
    // In non-ending mode, we need the capturing groups to match as much as
    // possible by using a positive lookahead to the end or next path segment.
    route += strict && endsWithSlash ? '' : '(?=\\/|$)';
  }

  return attachKeys(new RegExp('^' + route, flags(options)), keys);
}

},{"3":3}],3:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],"fnkit":[function(require,module,exports){
throw new Error('Don not require this module!!!');
},{}],"m-react-mixins":[function(require,module,exports){
arguments[4]["fnkit"][0].apply(exports,arguments)
},{"fnkit":"fnkit"}],"m-react":[function(require,module,exports){
(function (process){
!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):t.mReact=e()}(this,function(){"use strict";function t(){}function e(t){if(null===t)return"null";if(void 0===t)return"undefined";if(t!==t)return"NaN";var e=Object.prototype.toString.call(t).match(dt);return null==e?"unknown":e[1].toLowerCase()}function n(){return pt.apply(arguments[0],pt.call(arguments,1))}function r(t,e){return Object.prototype.hasOwnProperty.call(t,e)}function o(){for(var t,e,n,o=arguments.length,i=0;o>i&&(n=arguments[i],n!==Object(n));)i++;if(i===o)return{};for(i++;o>i;)if(e=arguments[i++],e===Object(e))for(t in e)r(e,t)&&(n[t]=e[t]);return n}function i(){var t=n(arguments);return o.apply(null,[{}].concat(t))}function s(t){if("object"!==e(t))throw new TypeError("[removeVoidValue]param should be a object! given: "+t);var n={};return Object.keys(t).forEach(function(e){void 0!==t[e]&&(n[e]=t[e])}),n}function a(t){for(var n=[],r=!0,o=0,i=t.length;i>o;o++){var s=t[o];if("array"!==e(s)){r=!1;break}n.push(s)}return n=r===!1||0===t.length?t:[].concat.apply([],n)}function l(t){switch(e(t)){case"undefined":case"null":return[];case"array":return a(t);default:return[t]}}function u(){return Object.create(null)}function c(t,n){return"string"!==e(t)||"regexp"!==e(n)?null:t.match(n)}function h(t,e){if(t===e)return e;var n=t.compareDocumentPosition(e);return 24&n?16&n?t:e:null}function f(){var t=arguments[0],r=arguments[1],o=n(arguments,2);if("string"!==e(t))throw new Error("selector in m(selector, attrs, children) should be a string");var i,s,a,l=!(null==r||"object"!==e(r)||"tag"in r||"view"in r||"subtree"in r),u={tag:"div",attrs:{}},c=[];r=l?r:{},a="class"in r?"class":"className",o=l?o:n(arguments,1),u.children="array"===e(o[0])?o[0]:o;for(;i=gt.exec(t);)""===i[1]&&i[2]?u.tag=i[2]:"#"===i[1]?u.attrs.id=i[2]:"."===i[1]?c.push(i[2]):"["===i[3][0]&&(s=mt.exec(i[3]),u.attrs[s[1]]=s[3]||(s[2]?"":!0));return c.length>0&&(u.attrs[a]=c.join(" ")),Object.keys(r).forEach(function(t){var n=r[t];u.attrs[t]=t===a&&"string"!==e(n)&&""!==n.trim()?(u.attrs[t]||"")+" "+n:n}),u}function d(){return!this instanceof d?new d:(this._index=-1,this._keys=[],void(this._values=[]))}function p(t,e){return isNaN(t)?isNaN(e):t===e}function v(t){if(t!==Object(t))throw new TypeError("[Map]Invalid value used as a map key! given: "+t)}function g(t,e,n){return t.addEventListener(e,n,!0)}function m(t,e,n){return t.removeEventListener(e,n,!0)}function y(t){return!this instanceof y?new y(t):(this.init(t),void(bt.test(t.type)?w(this,t,"key"):Et.test(t.type)&&w(this,t,"mouse")))}function w(t,e,n){for(var r=wt[n],o=0,i=r.length;i>o;o++){var s=r[o];t[s]=e[s]}}function b(t){if(!this instanceof b)return new b(t);if(t=t||_t||{documentElement:1},!t.documentElement)throw new Error('[DOMDelegator]Invalid parameter "doc", should be a document object! given: '+t);this.root=t.documentElement,this.listenedEvents=u(),this.eventDispatchers=u(),this.globalListeners=u(),this.domEvHandlerMap=new yt}function E(t,e){var n=e.globalListeners,r=e.root;return function(o){var i=n[t]||[];if(i&&i.length>0){var s=new y(o);s.target=r,_(i,s)}k(o.target,o,t,e)}}function k(t,e,n,r){var o=x(t,n,r);if(o&&o.handlers.length>0){var i=new y(e);i.currentTarget=o.currentTarget,_(o.handlers,i),i._bubbles&&k(o.currentTarget.parentNode,e,n,r)}}function x(t,e,n){if(null==t)return null;var r,o=O(n.domEvHandlerMap,t);return o&&(r=o[e])&&0!==r.length?{currentTarget:t,handlers:r}:x(t.parentNode,e,n)}function _(t,n){t.forEach(function(r){if("function"===e(r))r(n);else{if("function"!==e(r.handleEvent))throw new Error("[DOMDelegator callListeners] unknown handler found: "+JSON.stringify(t));r.handleEvent(n)}})}function O(t,e,n){return arguments.length>2?t.get(e,n):t.get(e)}function N(t,e,n,r){var o=t[e]||[];return 0===o.length&&n.listenTo(e),-1===o.indexOf(r)&&o.push(r),t[e]=o,r}function j(t,e,n,r){var o=t[e];if(!o||0===o.length||3===arguments.length)return o&&o.length&&n.unlistenTo(e),delete t[e],r;var i=o.indexOf(r);return-1!==i&&o.splice(i,1),t[e]=o,0===o.length&&(n.unlistenTo(e),delete t[e]),r}function T(t,e){return Object.keys(t).forEach(function(n){j(t,n,e)}),t}function D(n){this.options=n||{};var r=this.options.onFlush;this._cb="function"===e(r)?r:t,this._queue=[],this._startPos=0,this.flush=this.flush.bind(this)}function A(t,e){e=e||[],e=[].concat(e);for(var n=t.length-1;n>-1;n--)if(t[n]&&t[n].parentNode){e[n]&&M(e[n]),Ft.off(t[n]),Lt.remove(t[n]);try{t[n].parentNode.removeChild(t[n])}catch(r){}}0!=t.length&&(t.length=0)}function M(n){if(n.configContext&&"function"===e(n.configContext.onunload)&&(n.configContext.onunload(),n.configContext.onunload=null),n.controllers)for(var r=0,o=n.controllers.length;o>r;r++){var i=n.controllers[r];"function"===e(i.onunload)&&(i.onunload({preventDefault:t}),Nt.unloaders.remove(i))}if(n.children)if("array"===e(n.children))for(var r=0,o=n.children.length;o>r;r++){var s=n.children[r];M(s)}else n.children.tag&&M(n.children)}function C(t,n,r,o,i){return Object.keys(r).forEach(function(s){var a,l=r[s],u=o[s];if(s in o&&u===l)"value"===s&&"input"===n&&t.value!=l&&(t.value=l);else{o[s]=l;try{if("config"===s||"key"==s)return;if("function"===e(l)&&0===s.indexOf("on"))t[s]=l;else if((a=c(s,qt))&&a[1].length){var h=a[1].toLowerCase();Ht.off(t,h),P(l)&&Ht.on(t,h,l)}else"style"===s&&null!=l&&"object"===e(l)?(Object.keys(l).forEach(function(e){(null==u||u[e]!==l[e])&&(t.style[e]=l[e])}),"object"===e(u)&&Object.keys(u).forEach(function(e){e in l||(t.style[e]="")})):null!=i?"href"===s?t.setAttributeNS("http://www.w3.org/1999/xlink","href",l):"className"===s?t.setAttribute("class",l):t.setAttribute(s,l):s in t&&"list"!==s&&"style"!==s&&"form"!==s&&"type"!==s&&"width"!==s&&"height"!==s?("input"!==n||t[s]!==l)&&(t[s]=l):t.setAttribute(s,l)}catch(f){if(f.message.indexOf("Invalid argument")<0)throw f}}}),o}function P(t){return"function"===e(t)||t&&"function"===e(t.handleEvent)}function R(t,n,r,o,i,s,a,l,u,c,h){try{(null==i||null==i.toString())&&(i="")}catch(f){i=""}if("retain"===i.subtree)return s;var d,p=e(s),v=e(i);return(null==s||p!==v)&&(s=L(i,s,l,o,r,v)),"array"===v?(i=W(i),d=s.length===i.length,s=F(i,s,t),s=H(i,s,t,n,l,a,d,u,c,h)):null!=i&&"object"===v?s=q(i,s,t,l,a,u,c,h):"function"!==e(i)&&(s=B(i,s,t,n,l,a,u)),s}function L(t,e,n,r,o,i){var s,a;return null!=e&&(o&&o.nodes?(s=n-r,a=s+("array"===i?t:e.nodes).length,A(o.nodes.slice(s,a),o.slice(s,a))):e.nodes&&A(e.nodes,e)),e=new t.constructor,e.tag&&(e={}),e.nodes=[],e}function F(t,n,r){function o(t){return"string"===e(t)||"number"===e(t)&&"NaN"!==e(t)}function i(t){return t&&t.attrs&&o(t.attrs.key)?t.attrs.key:void 0}function s(t,e){t&&t.attrs&&(void 0===e?delete t.attrs.key:t.attrs.key=e)}function a(){return t.length!==n.length?!0:t.some(function(t,e){var r=n[e];return r.attrs&&t.attrs&&r.attrs.key!==t.attrs.key})}function l(t,e){var r=i(t);if(void 0!==r)if(d[r]){var o=d[r].index;d[r]={action:f,index:e,from:o,element:n.nodes[o]||_t.createElement("div")}}else d[r]={action:h,index:e}}function u(e,o){var i=e.index,s=e.action;if(s===c&&(A(n[i].nodes,n[i]),o.splice(i,1)),s===h){var a=_t.createElement("div");a.setAttribute("data-mref",i);var l=t[i].attrs.key;r.insertBefore(a,r.childNodes[i]||null),o.splice(i,0,{attrs:{key:l},nodes:[a]}),o.nodes[i]=a}s===f&&(e.element.setAttribute("data-mref",i),r.childNodes[i]!==e.element&&null!==e.element&&r.insertBefore(e.element,r.childNodes[i]||null),o[i]=n[e.from],o.nodes[i]=e.element)}var c=1,h=2,f=3,d={},p=!1;n.forEach(function(t,e){var n=i(t);s(t,n),void 0!==n&&(p=!0,d[n]={action:c,index:e})});var v=0;if(t.some(function(t){var e=i(t);return s(t,e),void 0!==e})&&t.forEach(function(t){t&&t.attrs&&null==t.attrs.key&&(t.attrs.key="__mithril__"+v++)}),p&&a()){t.forEach(l);var g=void 0,m=new Array(n.length);g=Object.keys(d).map(function(t){return d[t]}).sort(function(t,e){return t.action-e.action||t.index-e.index}),m.nodes=n.nodes.slice();for(var y=0,w=g.length;w>y;y++)u(g[y],m);n=m}return n}function H(t,n,r,o,i,s,a,l,u,c){function h(t){var h=R(r,o,n,i,t,n[d],s,i+f||f,l,u,c);void 0!==h&&(h.nodes.intact||(a=!1),f+=h.$trusted?(h.match(/<[^\/]|\>\s*[^<]/g)||[0]).length:"array"===e(h)?h.length:1,n[d++]=h)}var f=0,d=0,p=[];if(t.forEach(h),!a){for(var v=0,g=t.length;g>v;v++)null!=n[v]&&p.push.apply(p,n[v].nodes);for(var v=0,m=void 0;m=n.nodes[v];v++)null!=m.parentNode&&p.indexOf(m)<0&&A([m],[n[v]]);t.length<n.length&&(n.length=t.length),n.nodes=p}return n}function q(n,r,o,i,s,a,l,u){for(var c,h,f=[],d=[];n.view;){var p=n.view,v=n.view.$original||p,g=r.views?r.views.indexOf(v):-1,m=g>-1?r.controllers[g]:new(n.controller||t),y=m.instance;"object"==typeof y&&(c=y.name,"object"==typeof y.cached&&(h=y.cached),y.viewFn=[p,m]);var w=n&&n.attrs&&n.attrs.key;if(n=n.view(m),"retain"===n.subtree)return h?h:r;null!=w&&(n.attrs||(n.attrs={}),n.attrs.key=w),m.onunload&&Nt.unloaders.set(m,m.onunload),f.push(v),d.push(m)}if(!n.tag&&d.length)throw new Error("Component template must return a virtual element, not an array, string, etc.");if(n.attrs||(n.attrs={}),null!=h&&(r=h),r.attrs||(r.attrs={}),(n.tag!=r.tag||!U(n.attrs,r.attrs)||n.attrs.id!=r.attrs.id||n.attrs.key!=r.attrs.key||"string"===e(c)&&r.componentName!=c)&&r.nodes.length&&A(r.nodes,r),"string"!==e(n.tag))return r;var b,E,k=0===r.nodes.length,x=Object.keys(n.attrs),_=x.length>("key"in n.attrs?1:0);if(n.attrs.xmlns?l=n.attrs.xmlns:"svg"===n.tag?l="http://www.w3.org/2000/svg":"math"===n.tag&&(l="http://www.w3.org/1998/Math/MathML"),k){var O=I(o,l,n,i);b=O[0],E=O[1],r={tag:n.tag,attrs:_?C(b,n.tag,n.attrs,{},l):n.attrs,children:null!=n.children&&n.children.length>0?R(b,n.tag,void 0,void 0,n.children,r.children,!0,0,n.attrs.contenteditable?b:a,l,u):n.children,nodes:[b]},d.length&&(r.views=f,r.controllers=d),r.children&&!r.children.nodes&&(r.children.nodes=[]),"select"===n.tag&&"value"in n.attrs&&C(b,n.tag,{value:n.attrs.value},{},l),null!=E&&o.insertBefore(b,o.childNodes[E]||null)}else b=r.nodes[0],_&&C(b,n.tag,n.attrs,r.attrs,l),r.children=R(b,n.tag,void 0,void 0,n.children,r.children,!1,0,n.attrs.contenteditable?b:a,l,u),r.nodes.intact=!0,d.length&&(r.views=f,r.controllers=d),s===!0&&null!=b&&o.insertBefore(b,o.childNodes[i]||null);if("string"===e(c)&&(r.componentName=c),"function"===e(n.attrs.config)){var N=r.configContext=r.configContext||{},j=function(t){return function(){return n.attrs.config.apply(n,t)}};u.push(j([b,!k,N,r,[o,i,a,l]]))}return r}function I(t,e,n,r){var o,i,s=r;if(t&&t.childNodes.length&&(i=S(t,r),i&&i[0])){if(s=i[1],i[0].tagName.toLowerCase()==n.tag.toLowerCase())return[i[0],null];A([i[0]])}return o=n.attrs.is?void 0===e?_t.createElement(n.tag,n.attrs.is):_t.createElementNS(e,n.tag,n.attrs.is):void 0===e?_t.createElement(n.tag):_t.createElementNS(e,n.tag),o.setAttribute("data-mref",r),[o,s]}function S(t,e){for(var n,r=0,o=t.childNodes.length;o>r;r++)if(n=t.childNodes[r],n.getAttribute&&n.getAttribute("data-mref")==e)return[n,r];return null}function B(t,e,n,r,o,i,s){var a;if(0===e.nodes.length){if(""==t)return e;A([n.childNodes[o]]),t.$trusted?a=$(n,o,t):(a=[_t.createTextNode(t)],n.nodeName.match(It)||n.insertBefore(a[0],n.childNodes[o]||null)),e="string number boolean".indexOf(typeof t)>-1?new t.constructor(t):t,e.nodes=a}else e.valueOf()!==t.valueOf()||i===!0?(a=e.nodes,s&&s===_t.activeElement||(t.$trusted?(A(a,e),a=$(n,o,t)):"textarea"===r?n.value=t:s?s.innerHTML=t:((1===a[0].nodeType||a.length>1)&&(A(e.nodes,e),a=[_t.createTextNode(t)]),n.insertBefore(a[0],n.childNodes[o]||null),a[0].nodeValue=t)),e=new t.constructor(t),e.nodes=a):e.nodes.intact=!0;return e}function W(t){for(var n=0;n<t.length;n++)"array"===e(t[n])&&(t=t.concat.apply([],t),n--);return t}function U(t,e){var n=Object.keys(t).sort().join(),r=Object.keys(e).sort().join();return n===r}function $(t,e,n){var r=t.childNodes[e];if(r){var o=1!==r.nodeType,i=_t.createElement("span");o?(t.insertBefore(i,r||null),i.insertAdjacentHTML("beforebegin",n),t.removeChild(i)):r.insertAdjacentHTML("beforebegin",n)}else t.insertAdjacentHTML("beforeend",n);for(var s,a=[];(s=t.childNodes[e++])!==r;)a.push(s);return a}function K(t,e,n,r){var o={root:t,vNode:e,forceRecreation:n};return r===!0?Y(o):void Nt.renderQueue.addTarget({mergeType:1,root:t,processor:Y,params:[o]})}function Y(t){var e=t.root,n=t.vNode,r=t.forceRecreation;if(!e)throw new Error("Ensure the DOM element being passed to m.route/m.mount/m.render is not undefined.");var o,i=[],s=e===_t||e===_t.documentElement,a=s?St:e;s&&"html"!==n.tag&&(n={tag:"html",attrs:{},children:n}),r&&Q(a),o=R(a,null,void 0,void 0,n,Bt.get(a),!1,0,null,void 0,i),i.forEach(function(t){t()}),Bt.set(a,o)}function Q(t){A(t.childNodes,Bt.get(t)),Bt.remove(t)}function X(t){Ut!==!0&&(Ut=!0,t===!0&&(Nt.forcing=!0),G(t),Ut=!1)}function G(t){var n,r,o,i;(0===Wt.length()||t===!0)&&"function"===e(Nt.computePreRedrawHook)&&(Nt.computePreRedrawHook(),Nt.computePreRedrawHook=null),Wt.length()>0&&Wt.stop();for(var s=0,a=Nt.roots.length;a>s;s++)n=Nt.roots[s],r=Nt.components[s],o=Nt.controllers[s],i=Nt.recreations[s],o&&("object"==typeof o.instance&&(o.instance.viewFn=[r.view,o]),K(n,r.view?r.view(o):"",i,t)),Nt.recreations[s]=void 0;t===!0&&(V(),Nt.forcing=!1)}function V(){"function"===e(Nt.computePostRedrawHook)&&(Nt.computePostRedrawHook(),Nt.computePostRedrawHook=null)}function Z(t){var e=t.processor,n=t.params;"function"==typeof e&&e.apply(null,n)}function z(t,e){var n,r,o,i;for(n=0,r=t.length;r>n;n++)if(i=J(t[n],e)){o=n;break}return o>-1?(t.splice(o,1),t.push(i)):t.push(e),t}function J(t,e){var n=t.root,r=e.root;if(t.mergeType&e.mergeType)return n===r?e:null;var o=h(n,r);return o?o===n?t:e:null}function tt(e,r){var o=function(){return(e.controller||t).apply(this,r)||this},i=function(t){return arguments.length>1&&(r=r.concat(n(arguments,1))),e.view.apply(e,r.length?[t].concat(r):[t])};i.$original=e.view;var s={controller:o,view:i};return r[0]&&null!=r[0].key&&(s.attrs={key:r[0].key}),s}function et(t){return tt(t,n(arguments,1))}function nt(n,r,o){if(!n)throw new Error("Please ensure the DOM element exists before rendering a template into it.");var i=Nt.roots.indexOf(n);0>i&&(i=Nt.roots.length);var s=!1,a={preventDefault:function(){s=!0,Nt.computePreRedrawHook=Nt.computePostRedrawHook=null}};if(Nt.unloaders.each(function(t,e){t.call(e,a),e.onunload=null}),s?Nt.unloaders.each(function(t,e){e.onunload=t}):Nt.unloaders.clear(),Nt.controllers[i]&&"function"===e(Nt.controllers[i].onunload)&&Nt.controllers[i].onunload(a),!s){Nt.roots[i]=n;var l=$t=r=r||{controller:t},u=r.controller||t,c=new u;return l===$t&&(Nt.controllers[i]=c,Nt.components[i]=r,Nt.recreations[i]=o),X(),Nt.controllers[i]}}function rt(t,e){if(!(t instanceof e))throw new TypeError("Cannot call a class as a function")}function ot(t){var e=t.viewFn,n=e[0](e[1]),r=t.props.key,o=t.redrawData,i=o[0],s=o[1],a=o[2],l=o[3],u=[];null!=r&&(n.attrs=n.attrs||{},n.attrs.key=r),t.cached=R(i,null,void 0,void 0,n,t.cached,!1,s,a,l,u);for(var c=0,h=u.length;h>c;c++)u[c]()}function it(t){if("object"!==e(t))throw new TypeError("[createComponent]param should be a object! given: "+t);var n={},r=at(t);return n.controller=function(t,n){var o=new r(t,n),i={instance:o};return i.onunload=o.onunload.bind(o,o.componentWillUnmount),"string"===e(o.name)&&(i.name=o.name),i},n.view=lt(),n}function st(t,r){var o;for("array"!==e(r)&&(r=n(arguments,1)),r=r.filter(function(t){return"object"===e(t)});r.length>0;)o=r.shift(),Object.keys(o).forEach(function(n){if("mixins"===n)return void(r=ht([].concat(o[n]),r));if(-1===Xt.indexOf(n))return-1!==Yt.indexOf(n)?void("array"===e(t[n])?t[n].push(o[n]):t[n]="function"===e(t[n])?[t[n],o[n]]:[o[n]]):void(t[n]=o[n])});Yt.forEach(function(n){if("array"===e(t[n])){var r=t[n].filter(function(t){return"function"===e(t)});t[n]=ft(-1!==Qt.indexOf(n),r)}})}function at(t){var n,r=function(){Gt.apply(this,arguments),ut(r.prototype,this)};return r.prototype=Object.create(Gt.prototype),n=t.mixins||[],delete t.mixins,n="array"===e(n)?n.concat(t):[n,t],st(r.prototype,n),r}function lt(){var t={};return function(n,r,o){var i=n.instance,s=t.props,a=t.state,l=function(t,n,r,o,l){ct(i,"setInternalProps",t,o,l),n?ct(i,"componentDidUpdate",t,s,a):(ct(i,"componentDidMount",t),"function"===e(i.componentWillDetached)&&(r.onunload=i.componentWillDetached.bind(i,t)))};if(i.setProps(r,o),t.props=i.props,t.state=i.state,null!=i.root){if(ct(i,"shouldComponentUpdate",s,a)===!1)return{subtree:"retain"};ct(i,"componentWillUpdate",i.root,s,a)}else ct(i,"componentWillMount",s,a);var u=ct(i,"render",i.props,i.state);return u.attrs=u.attrs||{},u.attrs.config=l,u}}function ut(t,n){Object.keys(t).forEach(function(r){var o=t[r];("function"===e(o)||/^on[A-Z]\w*/.test(r))&&(n[r]=o.bind(n))})}function ct(t,r){var o=n(arguments,2);return"function"===e(t[r])?t[r].apply(t,o):void 0}function ht(t,e){var n,r,o=t.length;for(n=0;o>n;n++)r=t[n],-1===e.indexOf(r)&&e.unshift(r);return e}function ft(t,e){return function(){for(var r,o=n(arguments,0),i=this,s=0,a=e.length,l=o;a>s;s++)r=e[s],l=r.apply(i,o),o=t?l:o;return l}}var dt=/^\[object (\w+)\]$/,pt=Array.prototype.slice,vt=f,gt=/(?:(^|#|\.)([^#\.\[\]]+))|(\[.+?\])/g,mt=/\[(.+?)(?:=("|'|)(.*?)\2)?\]/;f.trust=function(t){return t=new String(t),t.$trusted=!0,t};var yt=d;d.prototype={has:function(t){v(t);var e,n=this._keys;if(t!=t||0===t)for(e=n.length;e--&&!p(n[e],t););else e=n.indexOf(t);return this._index=e,e>-1},clear:function(){this._keys.length=0,this._values.length=0,this._index=-1},set:function(t,e){return this.has(t)?this._values[this._index]=e:this._values[this._keys.push(t)-1]=e,this},get:function(t,e){return this.has(t)?this._values[this._index]:(arguments.length>1&&this.set(t,e),e)},remove:function(t){var e=this._index;return this.has(t)&&(this._keys.splice(e,1),this._values.splice(e,1)),e>-1},each:function(t){if("function"==typeof t)for(var e=0,n=this._keys.length;n>e;e++)t(this._values[e],this._keys[e])}};var wt={all:["altKey","bubbles","cancelable","ctrlKey","eventPhase","metaKey","relatedTarget","shiftKey","target","timeStamp","type","view","which"],mouse:["button","buttons","clientX","clientY","layerX","layerY","offsetX","offsetY","pageX","pageY","screenX","screenY","toElement"],key:["char","charCode","key","keyCode"]},bt=/^key|input/,Et=/^(?:mouse|pointer|contextmenu)|click/;y.prototype=i(y.prototype,{init:function(t){w(this,t,"all"),this.originalEvent=t,this._bubbles=!1},preventDefault:function(){return this.originalEvent.preventDefault()},startPropagation:function(){this._bubbles=!0}});var kt=b.prototype;kt.on=function(t,e,n){var r=O(this.domEvHandlerMap,t,u());return N(r,e,this,n),this},kt.off=function(t,e,n){var r=O(this.domEvHandlerMap,t);return r?(arguments.length>=3?j(r,e,this,n):2===arguments.length?j(r,e,this):T(r,this),0===Object.keys(r).length&&this.domEvHandlerMap.remove(t),this):this},kt.addGlobalEventListener=function(t,e){return N(this.globalListeners,t,this,e),this},kt.removeGlobalEventListener=function(t,e){return arguments.length>=2?j(this.globalListeners,t,this,e):1===arguments.length?j(this.globalListeners,t,this):T(this.globalListeners,this),this},kt.destroy=function(){this.unlistenTo(),this.listenedEvents=null,this.eventDispatchers=null,this.globalListeners=null,this.domEvHandlerMap.clear()},kt.listenTo=function(t){if(t in this.listenedEvents||(this.listenedEvents[t]=0),this.listenedEvents[t]++,1!==this.listenedEvents[t])return this;var e=this.eventDispatchers[t];return e||(e=this.eventDispatchers[t]=E(t,this)),g(this.root,t,e),this},kt.unlistenTo=function(t){var e=this.eventDispatchers,n=this;if(0===arguments.length)return Object.keys(e).filter(function(t){var n=!!e[t];return n&&(e[t]=1),n}).forEach(function(t){n.unlistenTo(t)}),this;if(!(t in this.listenedEvents)||0===this.listenedEvents[t])return console.log('[DOMDelegator unlistenTo]event "'+t+'" is already unlistened!'),this;if(this.listenedEvents[t]--,this.listenedEvents[t]>0)return this;var r=this.eventDispatchers[t];if(!r)throw new Error("[DOMDelegator unlistenTo]: cannot unlisten to "+t);return m(this.root,t,r),this},D.prototype.addTarget=function(t){var n=this._queue.length;return"function"===e(this.options.onAddTarget)?this._queue=this.options.onAddTarget.call(this,this._queue,t):this._queue.push(t),0===n&&1===this._queue.length&&this.scheduleFlush(),this},D.prototype.removeTarget=function(t){var e=this._queue.indexOf(t);return-1!==e&&this._queue.splice(e,1),this},D.prototype.flush=function(){var t,n,r,o,i,s=new Date,a=this._cb,l=this._startPos;for(i=this._queue,r=l,o=i.length;o>r;r++)if(n=i[r],a.call(null,n),t=new Date-s,t>Tt){console.log("frame budget overflow:",t),r++;break}this._queue.splice(0,r),this._startPos=0,this._queue.length?this.scheduleFlush():"function"===e(this.options.onFinish)&&this.options.onFinish.call(null)},D.prototype.scheduleFlush=function(){return this._tick&&Mt(this._tick),this._tick=At(this.flush),this._tick},D.prototype.onFlush=function(t){if("function"!==e(t))throw new TypeError("[Batch.prototype.onFlush]need a Function here, but given "+t);return this._cb=t,this},D.prototype.length=function(){return this._queue.length},D.prototype.stop=function(){return Mt(this._tick),this._queue.length=0,this},["onAddTarget","onFinish"].forEach(function(t){D.prototype[t]=function(n){if("function"!==e(n))throw new TypeError("[Batch.prototype."+t+"]need a Function here, but given "+n);return this.options[t]=n,this}});for(var xt="undefined"!=typeof window?window:{},_t=xt.document,Ot="undefined"==typeof process||process.browser?"undefined"!=typeof window?"browser":"unknown":"nodejs",Nt={forcing:!1,unloaders:new yt,computePreRedrawHook:null,computePostRedrawHook:null,roots:[],recreations:[],components:[],controllers:[],domCacheMap:new yt,domDelegator:new b,renderQueue:new D},jt=0,Tt=16,Dt=["webkit","moz","ms","o"],At=xt.requestAnimationFrame,Mt=xt.cancelAnimationFrame||xt.cancelRequestAnimationFrame,Ct=0,Pt=Dt.length;Pt>Ct&&!At;++Ct)At=xt[Dt[Ct]+"RequestAnimationFrame"],Mt=xt[Dt[Ct]+"CancelAnimationFrame"]||xt[Dt[Ct]+"CancelRequestAnimationFrame"];At||(At=function(t){var e=Date.now?Date.now():(new Date).getTime(),n=Math.max(0,Tt-(e-jt)),r=setTimeout(function(){t(e+n)},n);return jt=e+n,r}),Mt||(Mt=function(t){return clearTimeout(t)});var Rt,Lt=Nt.domCacheMap,Ft=Nt.domDelegator,Ht=Nt.domDelegator,qt=/^ev([A-Z]\w*)/,It=/^(AREA|BASE|BR|COL|COMMAND|EMBED|HR|IMG|INPUT|KEYGEN|LINK|META|PARAM|SOURCE|TRACK|WBR)$/,St={appendChild:function(t){void 0===Rt&&(Rt=_t.createElement("html")),_t.documentElement&&_t.documentElement!==t?_t.replaceChild(t,_t.documentElement):_t.appendChild(t),this.childNodes=_t.childNodes},insertBefore:function(t){this.appendChild(t)},childNodes:[]},Bt=Nt.domCacheMap,Wt=Nt.renderQueue.onFinish(V),Ut=!1;Nt.renderQueue.onFlush(Z).onAddTarget(z);var $t,Kt=et,Yt=["componentWillMount","componentDidMount","componentWillUpdate","componentDidUpdate","componentWillUnmount","componentWillDetached","componentWillReceiveProps","getInitialProps","getInitialState"],Qt=["getInitialProps","getInitialState","componentWillReceiveProps"],Xt=["setState","mixins","onunload","setInternalProps","redraw"],Gt=function(){function t(n,r){if(rt(this,t),"object"!==e(n)&&null!=n)throw new TypeError("[Component]param for constructor should a object or null or undefined! given: "+n);this.props=n||{},this.props.children=l(r),this.root=null,this.getInitialProps&&(this.props=this.getInitialProps(this.props)),this.getInitialState&&(this.state=this.getInitialState(this.props))}return t.prototype.setProps=function(t,e){this.componentWillReceiveProps&&(t=this.componentWillReceiveProps(t)),this.props=s(i(this.props,t,{children:l(e)}))},t.prototype.onunload=function(t){"function"===e(t)&&t.call(this),this.root=null,this.cached=null,this.redrawData=null},t.prototype.setInternalProps=function(t,e,n){this.root=t,this.cached=e,this.redrawData=n},t.prototype.redraw=function(){if(null!=this.redrawData){var t=this;Nt.renderQueue.addTarget({mergeType:0,processor:ot,root:t.root,params:[t]})}},t.prototype.setState=function(t,e){null==this.state&&(this.state={}),this.state=i(this.state,t),e||"browser"!==Ot||this.redraw()},t}(),Vt=vt;Vt.render=K,Vt.redraw=X,Vt.mount=nt,Vt.component=Kt,Vt.createComponent=it,Vt.domDelegator=Nt.domDelegator,"undefined"==typeof Object.assign&&(Object.assign=o);var Zt=Vt;return Zt});
}).call(this,require(1))
},{"1":1}],"page":[function(require,module,exports){
(function (process){
  /* globals require, module */

  'use strict';

  /**
   * Module dependencies.
   */

  var pathtoRegexp = require(2);

  /**
   * Module exports.
   */

  module.exports = page;

  /**
   * Detect click event
   */
  var clickEvent = ('undefined' !== typeof document) && document.ontouchstart ? 'touchstart' : 'click';

  /**
   * To work properly with the URL
   * history.location generated polyfill in https://github.com/devote/HTML5-History-API
   */

  var location = ('undefined' !== typeof window) && (window.history.location || window.location);

  /**
   * Perform initial dispatch.
   */

  var dispatch = true;


  /**
   * Decode URL components (query string, pathname, hash).
   * Accommodates both regular percent encoding and x-www-form-urlencoded format.
   */
  var decodeURLComponents = true;

  /**
   * Base path.
   */

  var base = '';

  /**
   * Running flag.
   */

  var running;

  /**
   * HashBang option
   */

  var hashbang = false;

  /**
   * Previous context, for capturing
   * page exit events.
   */

  var prevContext;

  /**
   * Register `path` with callback `fn()`,
   * or route `path`, or redirection,
   * or `page.start()`.
   *
   *   page(fn);
   *   page('*', fn);
   *   page('/user/:id', load, user);
   *   page('/user/' + user.id, { some: 'thing' });
   *   page('/user/' + user.id);
   *   page('/from', '/to')
   *   page();
   *
   * @param {String|Function} path
   * @param {Function} fn...
   * @api public
   */

  function page(path, fn) {
    // <callback>
    if ('function' === typeof path) {
      return page('*', path);
    }

    // route <path> to <callback ...>
    if ('function' === typeof fn) {
      var route = new Route(path);
      for (var i = 1; i < arguments.length; ++i) {
        page.callbacks.push(route.middleware(arguments[i]));
      }
      // show <path> with [state]
    } else if ('string' === typeof path) {
      page['string' === typeof fn ? 'redirect' : 'show'](path, fn);
      // start [options]
    } else {
      page.start(path);
    }
  }

  /**
   * Callback functions.
   */

  page.callbacks = [];
  page.exits = [];

  /**
   * Current path being processed
   * @type {String}
   */
  page.current = '';

  /**
   * Number of pages navigated to.
   * @type {number}
   *
   *     page.len == 0;
   *     page('/login');
   *     page.len == 1;
   */

  page.len = 0;

  /**
   * Get or set basepath to `path`.
   *
   * @param {String} path
   * @api public
   */

  page.base = function(path) {
    if (0 === arguments.length) return base;
    base = path;
  };

  /**
   * Bind with the given `options`.
   *
   * Options:
   *
   *    - `click` bind to click events [true]
   *    - `popstate` bind to popstate [true]
   *    - `dispatch` perform initial dispatch [true]
   *
   * @param {Object} options
   * @api public
   */

  page.start = function(options) {
    options = options || {};
    if (running) return;
    running = true;
    if (false === options.dispatch) dispatch = false;
    if (false === options.decodeURLComponents) decodeURLComponents = false;
    if (false !== options.popstate) window.addEventListener('popstate', onpopstate, false);
    if (false !== options.click) {
      document.addEventListener(clickEvent, onclick, false);
    }
    if (true === options.hashbang) hashbang = true;
    if (!dispatch) return;
    var url = (hashbang && ~location.hash.indexOf('#!')) ? location.hash.substr(2) + location.search : location.pathname + location.search + location.hash;
    page.replace(url, null, true, dispatch);
  };

  /**
   * Unbind click and popstate event handlers.
   *
   * @api public
   */

  page.stop = function() {
    if (!running) return;
    page.current = '';
    page.len = 0;
    running = false;
    document.removeEventListener(clickEvent, onclick, false);
    window.removeEventListener('popstate', onpopstate, false);
  };

  /**
   * Show `path` with optional `state` object.
   *
   * @param {String} path
   * @param {Object} state
   * @param {Boolean} dispatch
   * @return {Context}
   * @api public
   */

  page.show = function(path, state, dispatch, push) {
    var ctx = new Context(path, state);
    page.current = ctx.path;
    if (false !== dispatch) page.dispatch(ctx);
    if (false !== ctx.handled && false !== push) ctx.pushState();
    return ctx;
  };

  /**
   * Goes back in the history
   * Back should always let the current route push state and then go back.
   *
   * @param {String} path - fallback path to go back if no more history exists, if undefined defaults to page.base
   * @param {Object} [state]
   * @api public
   */

  page.back = function(path, state) {
    if (page.len > 0) {
      // this may need more testing to see if all browsers
      // wait for the next tick to go back in history
      history.back();
      page.len--;
    } else if (path) {
      setTimeout(function() {
        page.show(path, state);
      });
    }else{
      setTimeout(function() {
        page.show(base, state);
      });
    }
  };


  /**
   * Register route to redirect from one path to other
   * or just redirect to another route
   *
   * @param {String} from - if param 'to' is undefined redirects to 'from'
   * @param {String} [to]
   * @api public
   */
  page.redirect = function(from, to) {
    // Define route from a path to another
    if ('string' === typeof from && 'string' === typeof to) {
      page(from, function(e) {
        setTimeout(function() {
          page.replace(to);
        }, 0);
      });
    }

    // Wait for the push state and replace it with another
    if ('string' === typeof from && 'undefined' === typeof to) {
      setTimeout(function() {
        page.replace(from);
      }, 0);
    }
  };

  /**
   * Replace `path` with optional `state` object.
   *
   * @param {String} path
   * @param {Object} state
   * @return {Context}
   * @api public
   */


  page.replace = function(path, state, init, dispatch) {
    var ctx = new Context(path, state);
    page.current = ctx.path;
    ctx.init = init;
    ctx.save(); // save before dispatching, which may redirect
    if (false !== dispatch) page.dispatch(ctx);
    return ctx;
  };

  /**
   * Dispatch the given `ctx`.
   *
   * @param {Object} ctx
   * @api private
   */

  page.dispatch = function(ctx) {
    var prev = prevContext,
      i = 0,
      j = 0;

    prevContext = ctx;

    function nextExit() {
      var fn = page.exits[j++];
      if (!fn) return nextEnter();
      fn(prev, nextExit);
    }

    function nextEnter() {
      var fn = page.callbacks[i++];

      if (ctx.path !== page.current) {
        ctx.handled = false;
        return;
      }
      if (!fn) return unhandled(ctx);
      fn(ctx, nextEnter);
    }

    if (prev) {
      nextExit();
    } else {
      nextEnter();
    }
  };

  /**
   * Unhandled `ctx`. When it's not the initial
   * popstate then redirect. If you wish to handle
   * 404s on your own use `page('*', callback)`.
   *
   * @param {Context} ctx
   * @api private
   */

  function unhandled(ctx) {
    if (ctx.handled) return;
    var current;

    if (hashbang) {
      current = base + location.hash.replace('#!', '');
    } else {
      current = location.pathname + location.search;
    }

    if (current === ctx.canonicalPath) return;
    page.stop();
    ctx.handled = false;
    location.href = ctx.canonicalPath;
  }

  /**
   * Register an exit route on `path` with
   * callback `fn()`, which will be called
   * on the previous context when a new
   * page is visited.
   */
  page.exit = function(path, fn) {
    if (typeof path === 'function') {
      return page.exit('*', path);
    }

    var route = new Route(path);
    for (var i = 1; i < arguments.length; ++i) {
      page.exits.push(route.middleware(arguments[i]));
    }
  };

  /**
   * Remove URL encoding from the given `str`.
   * Accommodates whitespace in both x-www-form-urlencoded
   * and regular percent-encoded form.
   *
   * @param {str} URL component to decode
   */
  function decodeURLEncodedURIComponent(val) {
    if (typeof val !== 'string') { return val; }
    return decodeURLComponents ? decodeURIComponent(val.replace(/\+/g, ' ')) : val;
  }

  /**
   * Initialize a new "request" `Context`
   * with the given `path` and optional initial `state`.
   *
   * @param {String} path
   * @param {Object} state
   * @api public
   */

  function Context(path, state) {
    if ('/' === path[0] && 0 !== path.indexOf(base)) path = base + (hashbang ? '#!' : '') + path;
    var i = path.indexOf('?');

    this.canonicalPath = path;
    this.path = path.replace(base, '') || '/';
    if (hashbang) this.path = this.path.replace('#!', '') || '/';

    this.title = document.title;
    this.state = state || {};
    this.state.path = path;
    this.querystring = ~i ? decodeURLEncodedURIComponent(path.slice(i + 1)) : '';
    this.pathname = decodeURLEncodedURIComponent(~i ? path.slice(0, i) : path);
    this.params = {};

    // fragment
    this.hash = '';
    if (!hashbang) {
      if (!~this.path.indexOf('#')) return;
      var parts = this.path.split('#');
      this.path = parts[0];
      this.hash = decodeURLEncodedURIComponent(parts[1]) || '';
      this.querystring = this.querystring.split('#')[0];
    }
  }

  /**
   * Expose `Context`.
   */

  page.Context = Context;

  /**
   * Push state.
   *
   * @api private
   */

  Context.prototype.pushState = function() {
    page.len++;
    history.pushState(this.state, this.title, hashbang && this.path !== '/' ? '#!' + this.path : this.canonicalPath);
  };

  /**
   * Save the context state.
   *
   * @api public
   */

  Context.prototype.save = function() {
    history.replaceState(this.state, this.title, hashbang && this.path !== '/' ? '#!' + this.path : this.canonicalPath);
  };

  /**
   * Initialize `Route` with the given HTTP `path`,
   * and an array of `callbacks` and `options`.
   *
   * Options:
   *
   *   - `sensitive`    enable case-sensitive routes
   *   - `strict`       enable strict matching for trailing slashes
   *
   * @param {String} path
   * @param {Object} options.
   * @api private
   */

  function Route(path, options) {
    options = options || {};
    this.path = (path === '*') ? '(.*)' : path;
    this.method = 'GET';
    this.regexp = pathtoRegexp(this.path,
      this.keys = [],
      options.sensitive,
      options.strict);
  }

  /**
   * Expose `Route`.
   */

  page.Route = Route;

  /**
   * Return route middleware with
   * the given callback `fn()`.
   *
   * @param {Function} fn
   * @return {Function}
   * @api public
   */

  Route.prototype.middleware = function(fn) {
    var self = this;
    return function(ctx, next) {
      if (self.match(ctx.path, ctx.params)) return fn(ctx, next);
      next();
    };
  };

  /**
   * Check if this route matches `path`, if so
   * populate `params`.
   *
   * @param {String} path
   * @param {Object} params
   * @return {Boolean}
   * @api private
   */

  Route.prototype.match = function(path, params) {
    var keys = this.keys,
      qsIndex = path.indexOf('?'),
      pathname = ~qsIndex ? path.slice(0, qsIndex) : path,
      m = this.regexp.exec(decodeURIComponent(pathname));

    if (!m) return false;

    for (var i = 1, len = m.length; i < len; ++i) {
      var key = keys[i - 1];
      var val = decodeURLEncodedURIComponent(m[i]);
      if (val !== undefined || !(hasOwnProperty.call(params, key.name))) {
        params[key.name] = val;
      }
    }

    return true;
  };


  /**
   * Handle "populate" events.
   */

  var onpopstate = (function () {
    var loaded = false;
    if ('undefined' === typeof window) {
      return;
    }
    if (document.readyState === 'complete') {
      loaded = true;
    } else {
      window.addEventListener('load', function() {
        setTimeout(function() {
          loaded = true;
        }, 0);
      });
    }
    return function onpopstate(e) {
      if (!loaded) return;
      if (e.state) {
        var path = e.state.path;
        page.replace(path, e.state);
      } else {
        page.show(location.pathname + location.hash, undefined, undefined, false);
      }
    };
  })();
  /**
   * Handle "click" events.
   */

  function onclick(e) {

    if (1 !== which(e)) return;

    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (e.defaultPrevented) return;



    // ensure link
    var el = e.target;
    while (el && 'A' !== el.nodeName) el = el.parentNode;
    if (!el || 'A' !== el.nodeName) return;



    // Ignore if tag has
    // 1. "download" attribute
    // 2. rel="external" attribute
    if (el.hasAttribute('download') || el.getAttribute('rel') === 'external') return;

    // ensure non-hash for the same path
    var link = el.getAttribute('href');
    if (!hashbang && el.pathname === location.pathname && (el.hash || '#' === link)) return;



    // Check for mailto: in the href
    if (link && link.indexOf('mailto:') > -1) return;

    // check target
    if (el.target) return;

    // x-origin
    if (!sameOrigin(el.href)) return;



    // rebuild path
    var path = el.pathname + el.search + (el.hash || '');

    // strip leading "/[drive letter]:" on NW.js on Windows
    if (typeof process !== 'undefined' && path.match(/^\/[a-zA-Z]:\//)) {
      path = path.replace(/^\/[a-zA-Z]:\//, '/');
    }

    // same page
    var orig = path;

    if (path.indexOf(base) === 0) {
      path = path.substr(base.length);
    }

    if (hashbang) path = path.replace('#!', '');

    if (base && orig === path) return;

    e.preventDefault();
    page.show(orig);
  }

  /**
   * Event button.
   */

  function which(e) {
    e = e || window.event;
    return null === e.which ? e.button : e.which;
  }

  /**
   * Check if `href` is the same origin.
   */

  function sameOrigin(href) {
    var origin = location.protocol + '//' + location.hostname;
    if (location.port) origin += ':' + location.port;
    return (href && (0 === href.indexOf(origin)));
  }

  page.sameOrigin = sameOrigin;

}).call(this,require(1))
},{"1":1,"2":2}],"r-stream":[function(require,module,exports){
'use strict';

function isFunction(obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
}
// stream mixins
var streamMixins = {
  on: bindFn(on),
  log: bindFn(log)
};
function bindFn(fn){
  return function bound(){
    var stream = this, args = [].slice.call(arguments);
    return fn.apply(null, args.concat(stream));
  }
}
// Globals
var toUpdate = [];
var inStream;

var order = [];
var orderNextIdx = -1;

var flushing = false;


function on(f, s) {
  stream([s], function() { f(s.val); });
}
function log(msg, s) {
  if(arguments.length === 1){
    s = msg;
    msg = null;
  }
  stream([s], function(){
    console.log((msg?msg+' - ' : '') + s.toString());
  });
  stream([s.end], function(){
    console.log((msg?msg+' - ' : '') + 'stream<End>');
  });
}
function _initialDepsNotMet(stream) {
  stream.depsMet = stream.deps.every(function(s) {
    return s.hasVal;
  });
  return !stream.depsMet;
}

function updateStream(s) {
  if ((s.depsMet !== true && _initialDepsNotMet(s)) ||
      (s.end !== undefined && s.end.val === true)) return;
  if (inStream !== undefined) {
    toUpdate.push(s);
    return;
  }
  inStream = s;
  var returnVal = s.fn(s, s.depsChanged);
  if (returnVal !== undefined) {
    s(returnVal);
  }
  inStream = undefined;
  
  if (s.depsChanged !== undefined) s.depsChanged = [];
  s.shouldUpdate = false;
  if (flushing === false) flushUpdate();
}



function _findDeps(s) {
  var i, listeners = s.listeners;
  if (s.queued === false) {
    s.queued = true;
    for (i = 0; i < listeners.length; ++i) {
      _findDeps(listeners[i]);
    }
    order[++orderNextIdx] = s;
  }
}

function updateDeps(s) {
  var i, o, list, listeners = s.listeners;
  for (i = 0; i < listeners.length; ++i) {
    list = listeners[i];
    if (list.end === s) {
      endStream(list);
    } else {
      if (list.depsChanged !== undefined) list.depsChanged.push(s);
      list.shouldUpdate = true;
      _findDeps(list);
    }
  }
  for (; orderNextIdx >= 0; --orderNextIdx) {
    o = order[orderNextIdx];
    if (o.shouldUpdate === true) updateStream(o);
    o.queued = false;
  }
}



function flushUpdate() {
  flushing = true;
  // while (toUpdate.length > 0) updateDeps(toUpdate.shift());
  while(toUpdate.length > 0){
    var s = toUpdate.shift();
    if(s.vals.length > 0) s.val = s.vals.shift();
    updateDeps(s);
  }
  flushing = false;
}

function isStream(stream) {
  return isFunction(stream) && stream.type === 'r$';
}

function streamToString() {
  return 'stream(' + this.val + ')';
}

function updateStreamValue(s, n) {
  if (n !== undefined && n !== null && isFunction(n.then)) {
    n.then(s)['catch'](s);
    return;
  }
  s.val = n;
  s.hasVal = true;
  if (inStream === undefined) {
    flushing = true;
    updateDeps(s);
    if (toUpdate.length > 0) flushUpdate(); else flushing = false;
  } else if (inStream === s) {
    markListeners(s, s.listeners);
  } else {
    s.vals.push(n);
    toUpdate.push(s);
  }
}

function markListeners(s, lists) {
  var i, list;
  for (i = 0; i < lists.length; ++i) {
    list = lists[i];
    if (list.end !== s) {
      if (list.depsChanged !== undefined) {
        list.depsChanged.push(s);
      }
      list.shouldUpdate = true;
    } else {
      endStream(list);
    }
  }
}

function createStream() {
  var mixinKeys = Object.keys(streamMixins);
  function s(n) {
    var i, list;
    if (arguments.length === 0) {
      return s.val;
    } else {
      updateStreamValue(s, n);
      return s;
    }
  }
  s.hasVal = false;
  s.val = undefined;
  s.vals = [];
  s.listeners = [];
  s.queued = false;
  s.end = undefined;
  s.type = "r$";
  // s.map = boundMap;
  // s.ap = ap;
  // s.of = stream;
  if(mixinKeys.length){
    mixinKeys.forEach(function(name){
      s[name] = streamMixins[name];
    });
  }
  s.toString = streamToString;

  return s;
}

function addListeners(deps, s) {
  for (var i = 0; i < deps.length; ++i) {
    deps[i].listeners.push(s);
  }
}

function createDependentStream(deps, fn) {
  var i, s = createStream();
  s.fn = fn;
  s.deps = deps;
  s.depsMet = false;
  s.depsChanged = fn.length > 1 ? [] : undefined;
  s.shouldUpdate = false;
  addListeners(deps, s);
  return s;
}

function immediate(s) {
  if (s.depsMet === false) {
    s.depsMet = true;
    updateStream(s);
  }
  return s;
}

function removeListener(s, listeners) {
  var idx = listeners.indexOf(s);
  listeners[idx] = listeners[listeners.length - 1];
  listeners.length--;
}

function detachDeps(s) {
  for (var i = 0; i < s.deps.length; ++i) {
    removeListener(s, s.deps[i].listeners);
  }
  s.deps.length = 0;
}

function endStream(s) {
  if (s.deps !== undefined) detachDeps(s);
  if (s.end !== undefined) detachDeps(s.end);
}

function endsOn(endS, s) {
  detachDeps(s.end);
  endS.listeners.push(s.end);
  s.end.deps.push(endS);
  return s;
}

function trueFn() { return true; }

function stream(arg, fn) {
  var i, s, deps, depEndStreams;
  var endStream = createDependentStream([], trueFn);
  if (arguments.length > 1) {
    deps = []; depEndStreams = [];
    for (i = 0; i < arg.length; ++i) {
      if (arg[i] !== undefined) {
        deps.push(arg[i]);
        if (arg[i].end !== undefined) depEndStreams.push(arg[i].end);
      }
    }
    s = createDependentStream(deps, fn);
    s.end = endStream;
    endStream.listeners.push(s);
    addListeners(depEndStreams, endStream);
    endStream.deps = depEndStreams;
    updateStream(s);
  } else {
    s = createStream();
    s.end = endStream;
    endStream.listeners.push(s);
    if (arguments.length === 1) s(arg);
  }
  return s;
}

stream.isStream = isStream;
stream.endsOn = endsOn;
stream.on = on;
stream.immediate = immediate;
stream.mixin = function(name, fn){
  if(typeof name === 'object'){
    Object.keys(name).forEach(function(k){
      stream.mixin(k, name[k]);
    });
    return;
  }
  streamMixins[name] = bindFn(fn);
}

module.exports = stream;
},{}]},{},[]);
