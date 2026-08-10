"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/react/cjs/react.production.js
var require_react_production = __commonJS({
  "node_modules/react/cjs/react.production.js"(exports2) {
    "use strict";
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
    var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
    var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
    var REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var ReactNoopUpdateQueue = {
      isMounted: function() {
        return false;
      },
      enqueueForceUpdate: function() {
      },
      enqueueReplaceState: function() {
      },
      enqueueSetState: function() {
      }
    };
    var assign = Object.assign;
    var emptyObject = {};
    function Component(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    Component.prototype.isReactComponent = {};
    Component.prototype.setState = function(partialState, callback) {
      if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables."
        );
      this.updater.enqueueSetState(this, partialState, callback, "setState");
    };
    Component.prototype.forceUpdate = function(callback) {
      this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
    };
    function ComponentDummy() {
    }
    ComponentDummy.prototype = Component.prototype;
    function PureComponent(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
    pureComponentPrototype.constructor = PureComponent;
    assign(pureComponentPrototype, Component.prototype);
    pureComponentPrototype.isPureReactComponent = true;
    var isArrayImpl = Array.isArray;
    function noop() {
    }
    var ReactSharedInternals = { H: null, A: null, T: null, S: null };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function ReactElement(type, key, props) {
      var refProp = props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== refProp ? refProp : null,
        props
      };
    }
    function cloneAndReplaceKey(oldElement, newKey) {
      return ReactElement(oldElement.type, newKey, oldElement.props);
    }
    function isValidElement(object) {
      return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    function escape(key) {
      var escaperLookup = { "=": "=0", ":": "=2" };
      return "$" + key.replace(/[=:]/g, function(match) {
        return escaperLookup[match];
      });
    }
    var userProvidedKeyEscapeRegex = /\/+/g;
    function getElementKey(element, index) {
      return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
    }
    function resolveThenable(thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
        default:
          switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
            function(fulfilledValue) {
              "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
            },
            function(error) {
              "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
            }
          )), thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
          }
      }
      throw thenable;
    }
    function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
      var type = typeof children;
      if ("undefined" === type || "boolean" === type) children = null;
      var invokeCallback = false;
      if (null === children) invokeCallback = true;
      else
        switch (type) {
          case "bigint":
          case "string":
          case "number":
            invokeCallback = true;
            break;
          case "object":
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
                break;
              case REACT_LAZY_TYPE:
                return invokeCallback = children._init, mapIntoArray(
                  invokeCallback(children._payload),
                  array,
                  escapedPrefix,
                  nameSoFar,
                  callback
                );
            }
        }
      if (invokeCallback)
        return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
          return c;
        })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
          callback,
          escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
            userProvidedKeyEscapeRegex,
            "$&/"
          ) + "/") + invokeCallback
        )), array.push(callback)), 1;
      invokeCallback = 0;
      var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
      if (isArrayImpl(children))
        for (var i = 0; i < children.length; i++)
          nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if (i = getIteratorFn(children), "function" === typeof i)
        for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
          nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if ("object" === type) {
        if ("function" === typeof children.then)
          return mapIntoArray(
            resolveThenable(children),
            array,
            escapedPrefix,
            nameSoFar,
            callback
          );
        array = String(children);
        throw Error(
          "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
        );
      }
      return invokeCallback;
    }
    function mapChildren(children, func, context) {
      if (null == children) return children;
      var result = [], count = 0;
      mapIntoArray(children, result, "", "", function(child) {
        return func.call(context, child, count++);
      });
      return result;
    }
    function lazyInitializer(payload) {
      if (-1 === payload._status) {
        var ctor = payload._result;
        ctor = ctor();
        ctor.then(
          function(moduleObject) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 1, payload._result = moduleObject;
          },
          function(error) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 2, payload._result = error;
          }
        );
        -1 === payload._status && (payload._status = 0, payload._result = ctor);
      }
      if (1 === payload._status) return payload._result.default;
      throw payload._result;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    };
    var Children = {
      map: mapChildren,
      forEach: function(children, forEachFunc, forEachContext) {
        mapChildren(
          children,
          function() {
            forEachFunc.apply(this, arguments);
          },
          forEachContext
        );
      },
      count: function(children) {
        var n = 0;
        mapChildren(children, function() {
          n++;
        });
        return n;
      },
      toArray: function(children) {
        return mapChildren(children, function(child) {
          return child;
        }) || [];
      },
      only: function(children) {
        if (!isValidElement(children))
          throw Error(
            "React.Children.only expected to receive a single React element child."
          );
        return children;
      }
    };
    exports2.Activity = REACT_ACTIVITY_TYPE;
    exports2.Children = Children;
    exports2.Component = Component;
    exports2.Fragment = REACT_FRAGMENT_TYPE;
    exports2.Profiler = REACT_PROFILER_TYPE;
    exports2.PureComponent = PureComponent;
    exports2.StrictMode = REACT_STRICT_MODE_TYPE;
    exports2.Suspense = REACT_SUSPENSE_TYPE;
    exports2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    exports2.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    exports2.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    exports2.cacheSignal = function() {
      return null;
    };
    exports2.cloneElement = function(element, config, children) {
      if (null === element || void 0 === element)
        throw Error(
          "The argument must be a React element, but you passed " + element + "."
        );
      var props = assign({}, element.props), key = element.key;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
      var propName = arguments.length - 2;
      if (1 === propName) props.children = children;
      else if (1 < propName) {
        for (var childArray = Array(propName), i = 0; i < propName; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      return ReactElement(element.type, key, props);
    };
    exports2.createContext = function(defaultValue) {
      defaultValue = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null,
        Consumer: null
      };
      defaultValue.Provider = defaultValue;
      defaultValue.Consumer = {
        $$typeof: REACT_CONSUMER_TYPE,
        _context: defaultValue
      };
      return defaultValue;
    };
    exports2.createElement = function(type, config, children) {
      var propName, props = {}, key = null;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
      var childrenLength = arguments.length - 2;
      if (1 === childrenLength) props.children = children;
      else if (1 < childrenLength) {
        for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      if (type && type.defaultProps)
        for (propName in childrenLength = type.defaultProps, childrenLength)
          void 0 === props[propName] && (props[propName] = childrenLength[propName]);
      return ReactElement(type, key, props);
    };
    exports2.createRef = function() {
      return { current: null };
    };
    exports2.forwardRef = function(render) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render };
    };
    exports2.isValidElement = isValidElement;
    exports2.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    exports2.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    exports2.startTransition = function(scope) {
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      ReactSharedInternals.T = currentTransition;
      try {
        var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
      } catch (error) {
        reportGlobalError(error);
      } finally {
        null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    };
    exports2.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    exports2.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    exports2.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    exports2.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    exports2.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    exports2.useDebugValue = function() {
    };
    exports2.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    exports2.useEffect = function(create, deps) {
      return ReactSharedInternals.H.useEffect(create, deps);
    };
    exports2.useEffectEvent = function(callback) {
      return ReactSharedInternals.H.useEffectEvent(callback);
    };
    exports2.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    exports2.useImperativeHandle = function(ref, create, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
    };
    exports2.useInsertionEffect = function(create, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create, deps);
    };
    exports2.useLayoutEffect = function(create, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create, deps);
    };
    exports2.useMemo = function(create, deps) {
      return ReactSharedInternals.H.useMemo(create, deps);
    };
    exports2.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    exports2.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    exports2.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    exports2.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    exports2.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    };
    exports2.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    exports2.version = "19.2.6";
  }
});

// node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "node_modules/react/cjs/react.development.js"(exports2, module2) {
    "use strict";
    "production" !== process.env.NODE_ENV && (function() {
      function defineDeprecationWarning(methodName, info) {
        Object.defineProperty(Component.prototype, methodName, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              info[0],
              info[1]
            );
          }
        });
      }
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable)
          return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      function warnNoop(publicInstance, callerName) {
        publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
        var warningKey = publicInstance + "." + callerName;
        didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          callerName,
          publicInstance
        ), didWarnStateUpdateForUnmountedComponent[warningKey] = true);
      }
      function Component(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function ComponentDummy() {
      }
      function PureComponent(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function noop() {
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function cloneAndReplaceKey(oldElement, newKey) {
        newKey = ReactElement(
          oldElement.type,
          newKey,
          oldElement.props,
          oldElement._owner,
          oldElement._debugStack,
          oldElement._debugTask
        );
        oldElement._store && (newKey._store.validated = oldElement._store.validated);
        return newKey;
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      function escape(key) {
        var escaperLookup = { "=": "=0", ":": "=2" };
        return "$" + key.replace(/[=:]/g, function(match) {
          return escaperLookup[match];
        });
      }
      function getElementKey(element, index) {
        return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
      }
      function resolveThenable(thenable) {
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
          default:
            switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
              function(fulfilledValue) {
                "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
              },
              function(error) {
                "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            )), thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenable.reason;
            }
        }
        throw thenable;
      }
      function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
        var type = typeof children;
        if ("undefined" === type || "boolean" === type) children = null;
        var invokeCallback = false;
        if (null === children) invokeCallback = true;
        else
          switch (type) {
            case "bigint":
            case "string":
            case "number":
              invokeCallback = true;
              break;
            case "object":
              switch (children.$$typeof) {
                case REACT_ELEMENT_TYPE:
                case REACT_PORTAL_TYPE:
                  invokeCallback = true;
                  break;
                case REACT_LAZY_TYPE:
                  return invokeCallback = children._init, mapIntoArray(
                    invokeCallback(children._payload),
                    array,
                    escapedPrefix,
                    nameSoFar,
                    callback
                  );
              }
          }
        if (invokeCallback) {
          invokeCallback = children;
          callback = callback(invokeCallback);
          var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
          isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
            return c;
          })) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(
            callback,
            escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(
              userProvidedKeyEscapeRegex,
              "$&/"
            ) + "/") + childKey
          ), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
          return 1;
        }
        invokeCallback = 0;
        childKey = "" === nameSoFar ? "." : nameSoFar + ":";
        if (isArrayImpl(children))
          for (var i = 0; i < children.length; i++)
            nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if (i = getIteratorFn(children), "function" === typeof i)
          for (i === children.entries && (didWarnAboutMaps || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), didWarnAboutMaps = true), children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
            nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if ("object" === type) {
          if ("function" === typeof children.then)
            return mapIntoArray(
              resolveThenable(children),
              array,
              escapedPrefix,
              nameSoFar,
              callback
            );
          array = String(children);
          throw Error(
            "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return invokeCallback;
      }
      function mapChildren(children, func, context) {
        if (null == children) return children;
        var result = [], count = 0;
        mapIntoArray(children, result, "", "", function(child) {
          return func.call(context, child, count++);
        });
        return result;
      }
      function lazyInitializer(payload) {
        if (-1 === payload._status) {
          var ioInfo = payload._ioInfo;
          null != ioInfo && (ioInfo.start = ioInfo.end = performance.now());
          ioInfo = payload._result;
          var thenable = ioInfo();
          thenable.then(
            function(moduleObject) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 1;
                payload._result = moduleObject;
                var _ioInfo = payload._ioInfo;
                null != _ioInfo && (_ioInfo.end = performance.now());
                void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
              }
            },
            function(error) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 2;
                payload._result = error;
                var _ioInfo2 = payload._ioInfo;
                null != _ioInfo2 && (_ioInfo2.end = performance.now());
                void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            }
          );
          ioInfo = payload._ioInfo;
          if (null != ioInfo) {
            ioInfo.value = thenable;
            var displayName = thenable.displayName;
            "string" === typeof displayName && (ioInfo.name = displayName);
          }
          -1 === payload._status && (payload._status = 0, payload._result = thenable);
        }
        if (1 === payload._status)
          return ioInfo = payload._result, void 0 === ioInfo && console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?",
            ioInfo
          ), "default" in ioInfo || console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))",
            ioInfo
          ), ioInfo.default;
        throw payload._result;
      }
      function resolveDispatcher() {
        var dispatcher = ReactSharedInternals.H;
        null === dispatcher && console.error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
        return dispatcher;
      }
      function releaseAsyncTransition() {
        ReactSharedInternals.asyncTransitions--;
      }
      function enqueueTask(task) {
        if (null === enqueueTaskImpl)
          try {
            var requireString = ("require" + Math.random()).slice(0, 7);
            enqueueTaskImpl = (module2 && module2[requireString]).call(
              module2,
              "timers"
            ).setImmediate;
          } catch (_err) {
            enqueueTaskImpl = function(callback) {
              false === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = true, "undefined" === typeof MessageChannel && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var channel = new MessageChannel();
              channel.port1.onmessage = callback;
              channel.port2.postMessage(void 0);
            };
          }
        return enqueueTaskImpl(task);
      }
      function aggregateErrors(errors) {
        return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
      }
      function popActScope(prevActQueue, prevActScopeDepth) {
        prevActScopeDepth !== actScopeDepth - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        );
        actScopeDepth = prevActScopeDepth;
      }
      function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
        var queue = ReactSharedInternals.actQueue;
        if (null !== queue)
          if (0 !== queue.length)
            try {
              flushActQueue(queue);
              enqueueTask(function() {
                return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
              });
              return;
            } catch (error) {
              ReactSharedInternals.thrownErrors.push(error);
            }
          else ReactSharedInternals.actQueue = null;
        0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
      }
      function flushActQueue(queue) {
        if (!isFlushing) {
          isFlushing = true;
          var i = 0;
          try {
            for (; i < queue.length; i++) {
              var callback = queue[i];
              do {
                ReactSharedInternals.didUsePromise = false;
                var continuation = callback(false);
                if (null !== continuation) {
                  if (ReactSharedInternals.didUsePromise) {
                    queue[i] = callback;
                    queue.splice(0, i);
                    return;
                  }
                  callback = continuation;
                } else break;
              } while (1);
            }
            queue.length = 0;
          } catch (error) {
            queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
          } finally {
            isFlushing = false;
          }
        }
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
        isMounted: function() {
          return false;
        },
        enqueueForceUpdate: function(publicInstance) {
          warnNoop(publicInstance, "forceUpdate");
        },
        enqueueReplaceState: function(publicInstance) {
          warnNoop(publicInstance, "replaceState");
        },
        enqueueSetState: function(publicInstance) {
          warnNoop(publicInstance, "setState");
        }
      }, assign = Object.assign, emptyObject = {};
      Object.freeze(emptyObject);
      Component.prototype.isReactComponent = {};
      Component.prototype.setState = function(partialState, callback) {
        if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, partialState, callback, "setState");
      };
      Component.prototype.forceUpdate = function(callback) {
        this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
      };
      var deprecatedAPIs = {
        isMounted: [
          "isMounted",
          "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
        ],
        replaceState: [
          "replaceState",
          "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
        ]
      };
      for (fnName in deprecatedAPIs)
        deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
      ComponentDummy.prototype = Component.prototype;
      deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
      deprecatedAPIs.constructor = PureComponent;
      assign(deprecatedAPIs, Component.prototype);
      deprecatedAPIs.isPureReactComponent = true;
      var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference"), ReactSharedInternals = {
        H: null,
        A: null,
        T: null,
        S: null,
        actQueue: null,
        asyncTransitions: 0,
        isBatchingLegacy: false,
        didScheduleLegacyUpdate: false,
        didUsePromise: false,
        thrownErrors: [],
        getCurrentStack: null,
        recentlyCreatedOwnerStacks: 0
      }, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      deprecatedAPIs = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(
        deprecatedAPIs,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutMaps = false, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      }, didWarnAboutMessageChannel = false, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = false, isFlushing = false, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
        queueMicrotask(function() {
          return queueMicrotask(callback);
        });
      } : enqueueTask;
      deprecatedAPIs = Object.freeze({
        __proto__: null,
        c: function(size) {
          return resolveDispatcher().useMemoCache(size);
        }
      });
      var fnName = {
        map: mapChildren,
        forEach: function(children, forEachFunc, forEachContext) {
          mapChildren(
            children,
            function() {
              forEachFunc.apply(this, arguments);
            },
            forEachContext
          );
        },
        count: function(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        },
        toArray: function(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        },
        only: function(children) {
          if (!isValidElement(children))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return children;
        }
      };
      exports2.Activity = REACT_ACTIVITY_TYPE;
      exports2.Children = fnName;
      exports2.Component = Component;
      exports2.Fragment = REACT_FRAGMENT_TYPE;
      exports2.Profiler = REACT_PROFILER_TYPE;
      exports2.PureComponent = PureComponent;
      exports2.StrictMode = REACT_STRICT_MODE_TYPE;
      exports2.Suspense = REACT_SUSPENSE_TYPE;
      exports2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
      exports2.__COMPILER_RUNTIME = deprecatedAPIs;
      exports2.act = function(callback) {
        var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
        actScopeDepth++;
        var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = false;
        try {
          var result = callback();
        } catch (error) {
          ReactSharedInternals.thrownErrors.push(error);
        }
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        if (null !== result && "object" === typeof result && "function" === typeof result.then) {
          var thenable = result;
          queueSeveralMicrotasks(function() {
            didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          });
          return {
            then: function(resolve, reject) {
              didAwaitActCall = true;
              thenable.then(
                function(returnValue) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  if (0 === prevActScopeDepth) {
                    try {
                      flushActQueue(queue), enqueueTask(function() {
                        return recursivelyFlushAsyncActWork(
                          returnValue,
                          resolve,
                          reject
                        );
                      });
                    } catch (error$0) {
                      ReactSharedInternals.thrownErrors.push(error$0);
                    }
                    if (0 < ReactSharedInternals.thrownErrors.length) {
                      var _thrownError = aggregateErrors(
                        ReactSharedInternals.thrownErrors
                      );
                      ReactSharedInternals.thrownErrors.length = 0;
                      reject(_thrownError);
                    }
                  } else resolve(returnValue);
                },
                function(error) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(
                    ReactSharedInternals.thrownErrors
                  ), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
                }
              );
            }
          };
        }
        var returnValue$jscomp$0 = result;
        popActScope(prevActQueue, prevActScopeDepth);
        0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
          didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), ReactSharedInternals.actQueue = null);
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        return {
          then: function(resolve, reject) {
            didAwaitActCall = true;
            0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
              return recursivelyFlushAsyncActWork(
                returnValue$jscomp$0,
                resolve,
                reject
              );
            })) : resolve(returnValue$jscomp$0);
          }
        };
      };
      exports2.cache = function(fn) {
        return function() {
          return fn.apply(null, arguments);
        };
      };
      exports2.cacheSignal = function() {
        return null;
      };
      exports2.captureOwnerStack = function() {
        var getCurrentStack = ReactSharedInternals.getCurrentStack;
        return null === getCurrentStack ? null : getCurrentStack();
      };
      exports2.cloneElement = function(element, config, children) {
        if (null === element || void 0 === element)
          throw Error(
            "The argument must be a React element, but you passed " + element + "."
          );
        var props = assign({}, element.props), key = element.key, owner = element._owner;
        if (null != config) {
          var JSCompiler_inline_result;
          a: {
            if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(
              config,
              "ref"
            ).get) && JSCompiler_inline_result.isReactWarning) {
              JSCompiler_inline_result = false;
              break a;
            }
            JSCompiler_inline_result = void 0 !== config.ref;
          }
          JSCompiler_inline_result && (owner = getOwner());
          hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
          for (propName in config)
            !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
        }
        var propName = arguments.length - 2;
        if (1 === propName) props.children = children;
        else if (1 < propName) {
          JSCompiler_inline_result = Array(propName);
          for (var i = 0; i < propName; i++)
            JSCompiler_inline_result[i] = arguments[i + 2];
          props.children = JSCompiler_inline_result;
        }
        props = ReactElement(
          element.type,
          key,
          props,
          owner,
          element._debugStack,
          element._debugTask
        );
        for (key = 2; key < arguments.length; key++)
          validateChildKeys(arguments[key]);
        return props;
      };
      exports2.createContext = function(defaultValue) {
        defaultValue = {
          $$typeof: REACT_CONTEXT_TYPE,
          _currentValue: defaultValue,
          _currentValue2: defaultValue,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        };
        defaultValue.Provider = defaultValue;
        defaultValue.Consumer = {
          $$typeof: REACT_CONSUMER_TYPE,
          _context: defaultValue
        };
        defaultValue._currentRenderer = null;
        defaultValue._currentRenderer2 = null;
        return defaultValue;
      };
      exports2.createElement = function(type, config, children) {
        for (var i = 2; i < arguments.length; i++)
          validateChildKeys(arguments[i]);
        i = {};
        var key = null;
        if (null != config)
          for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = true, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config)
            hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
        var childrenLength = arguments.length - 2;
        if (1 === childrenLength) i.children = children;
        else if (1 < childrenLength) {
          for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++)
            childArray[_i] = arguments[_i + 2];
          Object.freeze && Object.freeze(childArray);
          i.children = childArray;
        }
        if (type && type.defaultProps)
          for (propName in childrenLength = type.defaultProps, childrenLength)
            void 0 === i[propName] && (i[propName] = childrenLength[propName]);
        key && defineKeyPropWarningGetter(
          i,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        var propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return ReactElement(
          type,
          key,
          i,
          getOwner(),
          propName ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports2.createRef = function() {
        var refObject = { current: null };
        Object.seal(refObject);
        return refObject;
      };
      exports2.forwardRef = function(render) {
        null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error(
          "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
        ) : "function" !== typeof render ? console.error(
          "forwardRef requires a render function but was given %s.",
          null === render ? "null" : typeof render
        ) : 0 !== render.length && 2 !== render.length && console.error(
          "forwardRef render functions accept exactly two parameters: props and ref. %s",
          1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
        );
        null != render && null != render.defaultProps && console.error(
          "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
        );
        var elementType = { $$typeof: REACT_FORWARD_REF_TYPE, render }, ownName;
        Object.defineProperty(elementType, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
          }
        });
        return elementType;
      };
      exports2.isValidElement = isValidElement;
      exports2.lazy = function(ctor) {
        ctor = { _status: -1, _result: ctor };
        var lazyType = {
          $$typeof: REACT_LAZY_TYPE,
          _payload: ctor,
          _init: lazyInitializer
        }, ioInfo = {
          name: "lazy",
          start: -1,
          end: -1,
          value: null,
          owner: null,
          debugStack: Error("react-stack-top-frame"),
          debugTask: console.createTask ? console.createTask("lazy()") : null
        };
        ctor._ioInfo = ioInfo;
        lazyType._debugInfo = [{ awaited: ioInfo }];
        return lazyType;
      };
      exports2.memo = function(type, compare) {
        null == type && console.error(
          "memo: The first argument must be a component. Instead received: %s",
          null === type ? "null" : typeof type
        );
        compare = {
          $$typeof: REACT_MEMO_TYPE,
          type,
          compare: void 0 === compare ? null : compare
        };
        var ownName;
        Object.defineProperty(compare, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
          }
        });
        return compare;
      };
      exports2.startTransition = function(scope) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        currentTransition._updatedFibers = /* @__PURE__ */ new Set();
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
        } catch (error) {
          reportGlobalError(error);
        } finally {
          null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error(
            "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
          ), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      };
      exports2.unstable_useCacheRefresh = function() {
        return resolveDispatcher().useCacheRefresh();
      };
      exports2.use = function(usable) {
        return resolveDispatcher().use(usable);
      };
      exports2.useActionState = function(action, initialState, permalink) {
        return resolveDispatcher().useActionState(
          action,
          initialState,
          permalink
        );
      };
      exports2.useCallback = function(callback, deps) {
        return resolveDispatcher().useCallback(callback, deps);
      };
      exports2.useContext = function(Context) {
        var dispatcher = resolveDispatcher();
        Context.$$typeof === REACT_CONSUMER_TYPE && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        );
        return dispatcher.useContext(Context);
      };
      exports2.useDebugValue = function(value, formatterFn) {
        return resolveDispatcher().useDebugValue(value, formatterFn);
      };
      exports2.useDeferredValue = function(value, initialValue) {
        return resolveDispatcher().useDeferredValue(value, initialValue);
      };
      exports2.useEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useEffect(create, deps);
      };
      exports2.useEffectEvent = function(callback) {
        return resolveDispatcher().useEffectEvent(callback);
      };
      exports2.useId = function() {
        return resolveDispatcher().useId();
      };
      exports2.useImperativeHandle = function(ref, create, deps) {
        return resolveDispatcher().useImperativeHandle(ref, create, deps);
      };
      exports2.useInsertionEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useInsertionEffect(create, deps);
      };
      exports2.useLayoutEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useLayoutEffect(create, deps);
      };
      exports2.useMemo = function(create, deps) {
        return resolveDispatcher().useMemo(create, deps);
      };
      exports2.useOptimistic = function(passthrough, reducer) {
        return resolveDispatcher().useOptimistic(passthrough, reducer);
      };
      exports2.useReducer = function(reducer, initialArg, init) {
        return resolveDispatcher().useReducer(reducer, initialArg, init);
      };
      exports2.useRef = function(initialValue) {
        return resolveDispatcher().useRef(initialValue);
      };
      exports2.useState = function(initialState) {
        return resolveDispatcher().useState(initialState);
      };
      exports2.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
        return resolveDispatcher().useSyncExternalStore(
          subscribe,
          getSnapshot,
          getServerSnapshot
        );
      };
      exports2.useTransition = function() {
        return resolveDispatcher().useTransition();
      };
      exports2.version = "19.2.6";
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    })();
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_production();
    } else {
      module2.exports = require_react_development();
    }
  }
});

// frontend/src/components/invoicing/invoiceRender.ts
var invoiceRender_exports = {};
__export(invoiceRender_exports, {
  SYSTEM_TEMPLATE_CATEGORY: () => SYSTEM_TEMPLATE_CATEGORY,
  SYSTEM_TEMPLATE_NAME: () => SYSTEM_TEMPLATE_NAME,
  downloadFile: () => downloadFile,
  openInvoiceWindow: () => openInvoiceWindow,
  printInvoiceDocument: () => printInvoiceDocument,
  renderInvoiceHtml: () => renderInvoiceHtml,
  slugify: () => slugify
});
module.exports = __toCommonJS(invoiceRender_exports);

// frontend/src/services/brandingService.ts
var import_react = __toESM(require_react(), 1);
var pick = (src, keys) => {
  for (const k of keys) {
    const v = src?.[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return "";
};
function resolveBranding(source) {
  const s = source || {};
  const logo = pick(s, ["logoImage", "logo", "companyLogo"]);
  const seal = pick(s, ["stampImage", "sealImage", "stamp", "seal"]);
  const signature = pick(s, ["digitalSignatureImage", "signatureImage", "authorizedSignatureImage"]);
  const letterhead = pick(s, ["letterheadImage", "letterhead"]);
  const reportHeader = pick(s, ["reportHeaderImage", "headerImage"]);
  const reportFooter = pick(s, ["reportFooterImage", "footerImage"]);
  const watermarkImage = pick(s, ["watermarkImage"]);
  const favicon = pick(s, ["faviconImage", "favicon"]);
  const watermarkText = pick(s, ["watermarkText"]);
  const headerText = pick(s, ["headerText"]);
  const footerText = pick(s, ["footerText"]);
  const signatureText = pick(s, ["signatureText", "authorizedSignatory"]);
  return {
    companyName: pick(s, ["name", "companyName", "legalName"]),
    primaryColor: pick(s, ["primaryColor", "themeColor", "brandColor"]) || "#1e293b",
    logo,
    seal,
    signature,
    letterhead,
    reportHeader,
    reportFooter,
    watermarkImage,
    favicon,
    watermarkText,
    headerText,
    footerText,
    signatureText,
    hasLogo: !!logo,
    hasSeal: !!seal,
    hasSignature: !!signature,
    hasLetterhead: !!letterhead,
    hasReportHeader: !!reportHeader,
    hasReportFooter: !!reportFooter,
    hasWatermark: !!(watermarkImage || watermarkText)
  };
}

// frontend/src/components/invoicing/richText.ts
var FONT_FAMILIES = [
  { label: "Inter", css: "'Inter', sans-serif", web: "Inter" },
  { label: "Poppins", css: "'Poppins', sans-serif", web: "Poppins" },
  { label: "Roboto", css: "'Roboto', sans-serif", web: "Roboto" },
  { label: "Open Sans", css: "'Open Sans', sans-serif", web: "Open Sans" },
  { label: "Lato", css: "'Lato', sans-serif", web: "Lato" },
  { label: "Montserrat", css: "'Montserrat', sans-serif", web: "Montserrat" },
  { label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", css: "'Times New Roman', Times, serif" },
  { label: "Calibri", css: "Calibri, 'Segoe UI', sans-serif" },
  { label: "Georgia", css: "Georgia, 'Times New Roman', serif" },
  { label: "Courier New", css: "'Courier New', Courier, monospace" }
];
var WEB_FONT_WEIGHTS = "100;300;400;500;600;700;800";
function webFontsUsed(elements) {
  const wanted = /* @__PURE__ */ new Set();
  for (const el of elements || []) {
    if (!el?.fontFamily) continue;
    const hit = FONT_FAMILIES.find((f) => f.css === el.fontFamily && f.web);
    if (hit?.web) wanted.add(hit.web);
  }
  return [...wanted];
}
function googleFontsLink(families) {
  if (!families.length) return "";
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${WEB_FONT_WEIGHTS}`).join("&");
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=swap">`;
}
function canvasTextCss(scope) {
  return `
    ${scope} p { margin: 0; }
    ${scope} ul, ${scope} ol { margin: 0; padding-left: 1.4em; }
    ${scope} ul { list-style: disc outside; }
    ${scope} ol { list-style: decimal outside; }
    ${scope} li { margin: 0; padding: 0; display: list-item; }
    ${scope} b, ${scope} strong { font-weight: bold; }
    ${scope} i, ${scope} em { font-style: italic; }
    ${scope} u { text-decoration: underline; }
    ${scope} s, ${scope} strike, ${scope} del { text-decoration: line-through; }
    ${scope} sub { vertical-align: sub; font-size: smaller; }
    ${scope} sup { vertical-align: super; font-size: smaller; }
  `;
}
var DEFAULT_STYLE_ROLES = {
  header: { fontFamily: FONT_FAMILIES[0].css, fontSize: 22, fontWeight: "700", color: "#111827", textAlign: "left", lineHeight: 1.2, letterSpacing: 0 },
  body: { fontFamily: FONT_FAMILIES[0].css, fontSize: 12, fontWeight: "400", color: "#1e293b", textAlign: "left", lineHeight: 1.5, letterSpacing: 0 },
  footer: { fontFamily: FONT_FAMILIES[0].css, fontSize: 10, fontWeight: "400", color: "#6b7280", textAlign: "center", lineHeight: 1.4, letterSpacing: 0 },
  table: { fontFamily: FONT_FAMILIES[0].css, fontSize: 11, fontWeight: "400", color: "#1e293b", textAlign: "left", lineHeight: 1.4, letterSpacing: 0 },
  totals: { fontFamily: FONT_FAMILIES[0].css, fontSize: 12, fontWeight: "600", color: "#111827", textAlign: "right", lineHeight: 1.4, letterSpacing: 0 }
};

// frontend/src/components/invoicing/invoiceTemplate.ts
var DEFAULT_COLUMNS = [
  { key: "sr", label: "#", visible: true },
  { key: "item", label: "Item", visible: true },
  { key: "hsn", label: "HSN/SAC", visible: true },
  { key: "qty", label: "Qty", visible: true },
  { key: "rate", label: "Rate", visible: true },
  { key: "disc", label: "Disc", visible: true },
  { key: "gst", label: "GST", visible: true },
  { key: "amount", label: "Amount", visible: true }
];
var DEFAULT_DESIGN = {
  template: "standard",
  paper: "A4",
  orientation: "portrait",
  title: "TAX INVOICE",
  colors: { primary: "", secondary: "", headerBg: "", tableHeaderBg: "#f1f5f9", tableHeaderText: "#475569", text: "#1e293b", border: "#e5e7eb", grandTotal: "#111827", footer: "#6b7280", accent: "" },
  font: { family: "'Segoe UI', Arial, sans-serif", size: 12, heading: "'Segoe UI', Arial, sans-serif", lineHeight: 1.5, headingBold: true, italicNotes: false, letterSpacing: 0, headerStyle: "split" },
  layout: { margin: 14, headerHeight: 0, footerHeight: 0, logoPosition: "left", titlePosition: "right", borderStyle: "solid", borderRadius: 0 },
  tableBorders: true,
  altRows: false,
  altRowColor: "#f8fafc",
  totalsPosition: "right",
  columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
  totals: { subtotal: true, discount: true, taxable: true, tax: true, roundOff: true, grandTotal: true, amountInWords: false },
  header: { showLogo: true, showAddress: true, showGstin: true, showTagline: false },
  customer: { showBillTo: true, showPayment: true, showEmailPhone: true, showGstin: true, showShipTo: false, showPan: false },
  footer: {
    showBank: true,
    showNotes: true,
    showTerms: true,
    showSignature: true,
    showFooterText: true,
    showPaymentInstructions: false,
    showQr: false,
    showThankYou: false,
    thankYouText: "Thank you for your business!",
    showContact: false,
    contact: { website: "", email: "", phone: "", address: "", social: "", copyright: "" }
  }
};
function resolveDesign(saved) {
  let d = saved;
  if (typeof saved === "string") {
    try {
      d = JSON.parse(saved);
    } catch {
      d = null;
    }
  }
  if (d && typeof d === "object" && d.designJson !== void 0 && d.template === void 0 && d.isCanvas === void 0) {
    try {
      d = typeof d.designJson === "string" ? JSON.parse(d.designJson) : d.designJson;
    } catch {
      d = null;
    }
  }
  if (d && typeof d === "object" && d.isCanvas) {
    return d;
  }
  const base = () => ({ ...DEFAULT_DESIGN, columns: DEFAULT_DESIGN.columns.map((c) => ({ ...c })) });
  if (!d || typeof d !== "object") return base();
  return {
    ...DEFAULT_DESIGN,
    ...d,
    colors: { ...DEFAULT_DESIGN.colors, ...d.colors || {} },
    font: { ...DEFAULT_DESIGN.font, ...d.font || {} },
    layout: { ...DEFAULT_DESIGN.layout, ...d.layout || {} },
    totals: { ...DEFAULT_DESIGN.totals, ...d.totals || {} },
    header: { ...DEFAULT_DESIGN.header, ...d.header || {} },
    customer: { ...DEFAULT_DESIGN.customer, ...d.customer || {} },
    footer: { ...DEFAULT_DESIGN.footer, ...d.footer || {}, contact: { ...DEFAULT_DESIGN.footer.contact, ...d.footer && d.footer.contact || {} } },
    columns: Array.isArray(d.columns) && d.columns.length ? d.columns.map((c) => ({ ...c })) : DEFAULT_DESIGN.columns.map((c) => ({ ...c }))
  };
}
var font = (family, heading = family) => ({ ...DEFAULT_DESIGN.font, family, heading });
var colors = (over) => ({ ...DEFAULT_DESIGN.colors, ...over });
var TEMPLATE_PRESETS = [
  { id: "standard", name: "Standard", paper: "A4", orientation: "portrait", swatch: "#C77E52", apply: { template: "standard", title: "TAX INVOICE", colors: colors({ primary: "#C77E52" }) } },
  { id: "modern", name: "Modern", paper: "A4", orientation: "portrait", swatch: "#6366f1", apply: { template: "modern", colors: colors({ primary: "#6366f1", tableHeaderBg: "#eef2ff", tableHeaderText: "#4338ca", accent: "#6366f1" }), font: font("'Inter', 'Segoe UI', sans-serif") } },
  { id: "professional", name: "Professional", paper: "A4", orientation: "portrait", swatch: "#0f766e", apply: { template: "professional", colors: colors({ primary: "#0f766e", tableHeaderBg: "#ccfbf1", tableHeaderText: "#0f766e", grandTotal: "#0f766e", accent: "#0f766e" }), font: font("'Inter', 'Segoe UI', sans-serif") } },
  { id: "corporate", name: "Corporate", paper: "A4", orientation: "portrait", swatch: "#111827", apply: { template: "corporate", colors: colors({ primary: "#111827", tableHeaderBg: "#111827", tableHeaderText: "#ffffff" }), font: font("Georgia, 'Times New Roman', serif") } },
  { id: "minimal", name: "Minimal", paper: "A4", orientation: "portrait", swatch: "#334155", apply: { template: "minimal", tableBorders: false, colors: colors({ primary: "#334155", tableHeaderBg: "#ffffff", tableHeaderText: "#334155", border: "#e5e7eb" }), font: { ...DEFAULT_DESIGN.font, headerStyle: "split" } } },
  { id: "creative", name: "Creative", paper: "A4", orientation: "portrait", swatch: "#db2777", apply: { template: "creative", colors: colors({ primary: "#db2777", secondary: "#7c3aed", headerBg: "#db2777", tableHeaderBg: "#fce7f3", tableHeaderText: "#9d174d", grandTotal: "#9d174d", accent: "#db2777" }), font: { ...font("'Inter', 'Segoe UI', sans-serif"), headerStyle: "banner" }, layout: { ...DEFAULT_DESIGN.layout, borderRadius: 8 } } },
  { id: "elegant", name: "Elegant", paper: "A4", orientation: "portrait", swatch: "#1f2937", apply: { template: "elegant", altRows: true, altRowColor: "#f8fafc", colors: colors({ primary: "#1f2937", secondary: "#b45309", tableHeaderBg: "#f9fafb", tableHeaderText: "#374151", grandTotal: "#b45309", accent: "#b45309" }), font: { ...font("'Playfair Display', Georgia, serif", "'Playfair Display', Georgia, serif"), headerStyle: "centered" } } },
  { id: "blue-business", name: "Blue Business", paper: "A4", orientation: "portrait", swatch: "#99552F", apply: { template: "blue-business", colors: colors({ primary: "#99552F", headerBg: "#99552F", tableHeaderBg: "#F7E3D3", tableHeaderText: "#1e40af", accent: "#99552F" }), font: { ...DEFAULT_DESIGN.font, headerStyle: "banner" } } },
  { id: "green-business", name: "Green Business", paper: "A4", orientation: "portrait", swatch: "#15803d", apply: { template: "green-business", altRows: true, altRowColor: "#f0fdf4", colors: colors({ primary: "#15803d", tableHeaderBg: "#dcfce7", tableHeaderText: "#166534", grandTotal: "#166534", accent: "#15803d" }) } },
  { id: "healthcare", name: "Healthcare", paper: "A4", orientation: "portrait", swatch: "#0891b2", apply: { template: "healthcare", colors: colors({ primary: "#0891b2", secondary: "#0e7490", headerBg: "#ecfeff", tableHeaderBg: "#cffafe", tableHeaderText: "#155e75", grandTotal: "#0e7490", accent: "#0891b2" }), font: font("'Inter', 'Segoe UI', sans-serif"), layout: { ...DEFAULT_DESIGN.layout, borderRadius: 6 } } },
  { id: "education", name: "Education", paper: "A4", orientation: "portrait", swatch: "#4338ca", apply: { template: "education", colors: colors({ primary: "#4338ca", secondary: "#d97706", tableHeaderBg: "#eef2ff", tableHeaderText: "#7C4527", grandTotal: "#d97706", accent: "#4338ca" }) } },
  { id: "manufacturing", name: "Manufacturing", paper: "A4", orientation: "portrait", swatch: "#c2410c", apply: { template: "manufacturing", altRows: true, altRowColor: "#fff7ed", colors: colors({ primary: "#1e293b", secondary: "#c2410c", tableHeaderBg: "#1e293b", tableHeaderText: "#ffffff", grandTotal: "#c2410c", accent: "#c2410c" }) } },
  { id: "retail", name: "Retail", paper: "A4", orientation: "portrait", swatch: "#7c3aed", apply: { template: "retail", colors: colors({ primary: "#7c3aed", secondary: "#db2777", headerBg: "#7c3aed", tableHeaderBg: "#f5f3ff", tableHeaderText: "#5b21b6", grandTotal: "#7c3aed", accent: "#7c3aed" }), font: { ...font("'Inter', 'Segoe UI', sans-serif"), headerStyle: "banner" }, layout: { ...DEFAULT_DESIGN.layout, borderRadius: 8 } } },
  { id: "technology", name: "Technology", paper: "A4", orientation: "portrait", swatch: "#0ea5e9", apply: { template: "technology", colors: colors({ primary: "#0ea5e9", secondary: "#6366f1", tableHeaderBg: "#111827", tableHeaderText: "#e5e7eb", grandTotal: "#0ea5e9", accent: "#0ea5e9" }), font: font("'Inter', 'Segoe UI', sans-serif"), layout: { ...DEFAULT_DESIGN.layout, borderRadius: 6 } } },
  { id: "luxury", name: "Luxury", paper: "A4", orientation: "portrait", swatch: "#a16207", apply: { template: "luxury", colors: colors({ primary: "#111827", secondary: "#a16207", headerBg: "#111827", tableHeaderBg: "#1f2937", tableHeaderText: "#fcd34d", grandTotal: "#a16207", accent: "#a16207" }), font: { ...font("'Playfair Display', Georgia, serif", "'Playfair Display', Georgia, serif"), headerStyle: "banner" } } }
];
var ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
var TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
var two = (n) => n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
var three = (n) => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h ? ONES[h] + " Hundred" + (r ? " " : "") : ""}${r ? two(r) : ""}`;
};
function amountInWords(amount) {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  const paise = Math.round((Math.abs(Number(amount) || 0) - n) * 100);
  if (n === 0 && !paise) return "Zero Rupees Only";
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor(n % 1e7 / 1e5);
  const thousand = Math.floor(n % 1e5 / 1e3);
  const rest = n % 1e3;
  let w = "";
  if (crore) w += `${two(crore)} Crore `;
  if (lakh) w += `${two(lakh)} Lakh `;
  if (thousand) w += `${two(thousand)} Thousand `;
  if (rest) w += three(rest);
  w = w.trim();
  let out = w ? `${w} Rupees` : "Rupees";
  if (paise) out += ` and ${two(paise)} Paise`;
  return `${out} Only`;
}
var esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
var money = (n) => `\u20B9${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
var colHead = (c) => {
  const r = ["qty", "rate", "disc", "gst", "amount"].includes(c.key) ? ' class="r"' : "";
  return `<th${r}>${esc(c.label)}</th>`;
};
var colCell = (c, it, i) => {
  switch (c.key) {
    case "sr":
      return `<td>${i + 1}</td>`;
    case "item":
      return `<td>${esc(it.name)}${it.description ? `<div class="muted">${esc(it.description)}</div>` : ""}</td>`;
    case "hsn":
      return `<td>${esc(it.hsnSac || "")}</td>`;
    case "qty":
      return `<td class="r">${esc(it.quantity)} ${esc(it.unit || "")}</td>`;
    case "rate":
      return `<td class="r">${money(it.rate)}</td>`;
    case "disc":
      return `<td class="r">${it.discountPct || 0}%</td>`;
    case "gst":
      return `<td class="r">${it.taxRate}%</td>`;
    case "amount":
      return `<td class="r">${money(it.amount)}</td>`;
    default:
      return "<td></td>";
  }
};
function invoiceDocHtml(inv, company, designIn, opts = {}) {
  if (designIn && designIn.isCanvas) {
    return renderCanvasHtml(inv, company, designIn, opts);
  }
  const d = resolveDesign(designIn);
  const b = resolveBranding(company);
  const primary = d.colors.primary || company?.themeColor || "#C77E52";
  const accent = d.colors.accent || "#9ca3af";
  const cols = (d.columns || DEFAULT_COLUMNS).filter((c2) => c2.visible);
  const intra = inv.cgst > 0;
  const tdBorder = d.tableBorders ? `1px ${d.layout.borderStyle} ${d.colors.border}` : "none";
  const pageSize = `${d.paper} ${d.orientation}`;
  const radius = d.layout.borderRadius || 0;
  const hasWidths = cols.some((c2) => c2.width);
  const colgroup = hasWidths ? `<colgroup>${cols.map((c2) => `<col${c2.width ? ` style="width:${c2.width}%"` : ""}/>`).join("")}</colgroup>` : "";
  const rows = (inv.items || []).map((it, i) => `<tr>${cols.map((c2) => colCell(c2, it, i)).join("")}</tr>`).join("");
  const totalRow = (label, val, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="r">${val}</td></tr>`;
  const totalsRows2 = [
    d.totals.subtotal ? totalRow("Subtotal", money(inv.subtotal)) : "",
    d.totals.discount ? totalRow("Discount", `\u2212 ${money(inv.discountTotal)}`) : "",
    d.totals.taxable ? totalRow("Taxable Amount", money(inv.taxableAmount)) : "",
    d.totals.tax ? intra ? totalRow("CGST", money(inv.cgst)) + totalRow("SGST", money(inv.sgst)) : totalRow("IGST", money(inv.igst)) : "",
    d.totals.roundOff ? totalRow("Round Off", money(inv.roundOff)) : "",
    d.totals.grandTotal ? totalRow("Grand Total", money(inv.grandTotal), "grand") : "",
    inv.amountPaid ? totalRow("Paid", money(inv.amountPaid)) + `<tr><td><b>Balance Due</b></td><td class="r"><b>${money(inv.balanceDue)}</b></td></tr>` : ""
  ].join("");
  const wordsBlock = d.totals.amountInWords ? `<div class="words">Amount in Words: <b>${esc(amountInWords(inv.grandTotal))}</b></div>` : "";
  const getLogoHtml = () => {
    if (!d.header.showLogo) return "";
    const fallbackJs = `this.style.display='none'; this.nextElementSibling.style.display='flex';`;
    const placeholder = `<div class="logo-placeholder" style="display:none;align-items:center;justify-content:center;width:100px;height:50px;background:#f8fafc;color:#9ca3af;font-size:11px;border:1px dashed #d1d5db;border-radius:4px;font-weight:600;margin-bottom:8px;">COMPANY LOGO</div>`;
    const emptyPlaceholder = `<div class="logo-placeholder" style="display:flex;align-items:center;justify-content:center;width:100px;height:50px;background:#f8fafc;color:#9ca3af;font-size:11px;border:1px dashed #d1d5db;border-radius:4px;font-weight:600;margin-bottom:8px;">COMPANY LOGO</div>`;
    if (b.hasLogo && b.logo && b.logo !== "null" && b.logo !== "undefined") {
      const isUrl = b.logo.includes("/") || b.logo.includes(".") || b.logo.startsWith("data:");
      if (!isUrl && b.logo.length <= 4) {
        return `<div class="logo-placeholder" style="display:flex;align-items:center;justify-content:center;width:50px;height:50px;background:#f1f5f9;color:#475569;font-size:20px;font-weight:bold;border-radius:8px;margin-bottom:8px;">${esc(b.logo)}</div>`;
      }
      return `<img class="logo" src="${b.logo}" onerror="${fallbackJs}" />${placeholder}`;
    }
    return emptyPlaceholder;
  };
  const logoHtml = getLogoHtml();
  const taglineHtml = d.header.showTagline && (company?.tagline || company?.motto) ? `<div class="muted" style="font-style:italic">${esc(company.tagline || company.motto)}</div>` : "";
  const companyBlock = `${logoHtml}<div class="brand">${esc(company?.name || "Company")}</div>
      ${d.header.showAddress ? `<div class="muted">${esc(company?.address || company?.city || "")}</div>` : ""}
      ${taglineHtml}
      ${d.header.showGstin ? `<div class="muted">GSTIN: ${esc(inv.companyGstin || company?.gstin || "\u2014")}</div>` : ""}
      ${company?.branchLabel ? `<div class="brand-branch">Branch: ${esc(company.branchLabel)}</div>` : ""}`;
  const titleBlock = `<h1>${esc(d.title || "TAX INVOICE")}</h1>
      <div class="muted"># <b>${esc(inv.invoiceNumber)}</b></div>
      <div class="muted">Date: ${esc(inv.invoiceDate)}${inv.dueDate ? ` &nbsp; Due: ${esc(inv.dueDate)}` : ""}</div>
      <div style="margin-top:4px"><span class="status">${esc(inv.status)}</span></div>`;
  let head;
  if (d.font.headerStyle === "centered") {
    head = `<div class="head head-centered"><div class="hc-brand">${companyBlock}</div><div class="title hc-title">${titleBlock}</div></div>`;
  } else if (d.font.headerStyle === "banner") {
    head = `<div class="head head-banner"><div class="hb-brand">${companyBlock}</div><div class="title hb-title">${titleBlock}</div></div>`;
  } else {
    head = `<div class="head">
    <div style="text-align:${d.layout.logoPosition}">${companyBlock}</div>
    <div class="title" style="text-align:${d.layout.titlePosition}">${titleBlock}</div>
  </div>`;
  }
  const billTo = d.customer.showBillTo ? `<div class="box"><h4>Bill To</h4><div><b>${esc(inv.billToName)}</b></div>
      <div class="muted">${esc(inv.billToAddress || "")}</div>
      ${d.customer.showGstin ? `<div class="muted">GSTIN: ${esc(inv.billToGstin || "\u2014")}${inv.billToState ? ` \xB7 ${esc(inv.billToState)}` : ""}</div>` : ""}
      ${d.customer.showPan && (inv.billToPan || inv.customerPan) ? `<div class="muted">PAN: ${esc(inv.billToPan || inv.customerPan)}</div>` : ""}
      ${d.customer.showEmailPhone ? `<div class="muted">${esc(inv.billToEmail || "")} ${esc(inv.billToPhone || "")}</div>` : ""}</div>` : "";
  const shipAddr = inv.billToShipAddress || inv.shipToAddress;
  const shipTo = d.customer.showShipTo && (inv.shipToName || shipAddr) ? `<div class="box"><h4>Ship To</h4><div><b>${esc(inv.shipToName || inv.billToName)}</b></div>
      <div class="muted">${esc(shipAddr || "")}</div>
      ${inv.shipToState ? `<div class="muted">${esc(inv.shipToState)}</div>` : ""}</div>` : "";
  const payRows = paymentInfoRows(inv);
  const payTerms = String(inv.paymentTerms ?? "").trim();
  const payment = d.customer.showPayment && payTerms ? `<div class="box" style="text-align:right"><h4>Payment</h4>
      <div class="muted">Terms: ${esc(payTerms)}</div></div>` : "";
  const gridInner = [billTo, shipTo, payment].filter(Boolean).join("");
  const footLeft = [
    d.footer.showNotes && inv.notes ? `<div class="muted"><b>Notes:</b> ${esc(inv.notes)}</div>` : "",
    d.footer.showTerms && inv.termsConditions ? `<div class="muted" style="margin-top:6px"><b>Terms:</b> ${esc(inv.termsConditions)}</div>` : "",
    // Payment instructions are preview-only (data-gated; real invoices don't carry the field).
    d.footer.showPaymentInstructions && inv.paymentInstructions ? `<div class="muted" style="margin-top:6px"><b>Payment Instructions:</b> ${esc(inv.paymentInstructions)}</div>` : ""
  ].join("");
  const qrBlock = "";
  const signBlock = d.footer.showSignature ? `<div class="sign">
      <div style="height:44px;position:relative">
        ${b.hasSeal ? `<img class="seal" src="${b.seal}" style="position:absolute;right:0;top:-6px;opacity:0.9" onerror="this.style.display='none'" />` : ""}
        ${b.hasSignature ? `<img class="sig" src="${b.signature}" onerror="this.style.display='none'" />` : ""}
      </div>
      <div style="border-top:1px solid #9ca3af;padding-top:4px" class="muted">${esc(b.signatureText || "Authorised Signatory")}<br>${esc(company?.name || "")}</div></div>` : "";
  const thankYou = d.footer.showThankYou && d.footer.thankYouText ? `<div class="thanks">${esc(d.footer.thankYouText)}</div>` : "";
  const c = d.footer.contact;
  const contactParts = d.footer.showContact ? [
    c.website || company?.website ? `\u{1F310} ${esc(c.website || company.website)}` : "",
    c.email || company?.email ? `\u2709 ${esc(c.email || company.email)}` : "",
    c.phone || company?.phone || company?.contactNumber ? `\u260E ${esc(c.phone || company.phone || company.contactNumber)}` : "",
    c.address || company?.address ? `\u{1F4CD} ${esc(c.address || company.address)}` : "",
    c.social ? esc(c.social) : ""
  ].filter(Boolean) : [];
  const contactBlock = contactParts.length ? `<div class="contact">${contactParts.join("&nbsp;&nbsp;\xB7&nbsp;&nbsp;")}</div>` : "";
  const copyrightBlock = d.footer.showContact && c.copyright ? `<div class="copyright">${esc(c.copyright)}</div>` : "";
  const footerTextBlock = d.footer.showFooterText && (b.footerText || company?.footerText) ? `<div class="muted" style="text-align:center;margin-top:16px;border-top:1px solid #e5e7eb;padding-top:8px">${esc(b.footerText || company.footerText)}</div>` : "";
  const printScript = opts.print === false ? "" : `<script>window.onload=function(){window.print();}</script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNumber)}</title>
  <style>
    @page { size: ${pageSize}; margin: ${d.layout.margin}mm; }
    * { box-sizing: border-box; } body { font-family: ${d.font.family}; color: ${d.colors.text}; font-size: ${d.font.size}px; line-height: ${d.font.lineHeight}; letter-spacing: ${d.font.letterSpacing || 0}px; margin: 0; position: relative; }
    .head { display: flex; justify-content: space-between; border-bottom: 3px solid ${primary}; padding-bottom: 12px; ${d.layout.headerHeight ? `min-height:${d.layout.headerHeight}px;` : ""}${d.colors.headerBg ? ` background:${d.colors.headerBg}; padding:12px; border-radius:${radius}px; border-bottom:none;` : ""} }
    .head-centered { flex-direction: column; align-items: center; text-align: center; gap: 8px; }
    .head-centered .hc-title, .head-centered .hc-brand { text-align: center; }
    .head-banner { align-items: center; background: ${d.colors.headerBg || primary}; color: #fff; padding: 16px; border-radius: ${radius}px; border-bottom: none; }
    .head-banner .brand, .head-banner .title h1 { color: #fff; }
    .head-banner .muted { color: rgba(255,255,255,0.85); }
    .head-banner .status { background: rgba(255,255,255,0.2); color: #fff; }
    .brand { font-size: 20px; font-weight: ${d.font.headingBold ? 800 : 600}; color: ${primary}; font-family: ${d.font.heading}; }
    /* Operating branch \u2014 a subtitle under the legal company name, never a substitute for it. */
    .brand-branch { font-size: 11px; font-weight: 700; color: ${d.colors.footer}; letter-spacing: .3px; margin-top: 1px; }
    .muted { color: ${d.colors.footer}; font-size: 10px; ${d.font.italicNotes ? "font-style: italic;" : ""} } .title { text-align: right; }
    .title h1 { margin: 0; font-size: 22px; letter-spacing: 1px; color: ${primary}; font-family: ${d.font.heading}; } .grid { display: flex; justify-content: space-between; margin: 16px 0; gap: 20px; }
    .box { flex: 1; ${radius ? `border-radius:${radius}px;` : ""} } .box h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; color: ${d.colors.secondary || accent}; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; } th { background: ${d.colors.tableHeaderBg}; text-transform: uppercase; font-size: 9px; color: ${d.colors.tableHeaderText}; }
    th, td { border: ${tdBorder}; padding: 6px 8px; text-align: left; } td.r, th.r { text-align: right; }
    ${d.altRows ? `tbody tr:nth-child(even) td { background: ${d.altRowColor}; }` : ""}
    .totals { width: 280px; margin-${d.totalsPosition === "left" ? "right" : "left"}: auto; margin-top: 10px; } .totals td { border: none; padding: 3px 8px; }
    .totals .grand { border-top: 2px solid ${d.colors.grandTotal}; font-weight: 800; font-size: 14px; color: ${d.colors.grandTotal}; }
    .words { margin-top: 10px; font-size: 11px; }
    .foot { margin-top: 22px; display: flex; justify-content: space-between; gap: 20px; ${d.layout.footerHeight ? `min-height:${d.layout.footerHeight}px;` : ""} } .sign { text-align: center; }
    .qr { text-align: center; } .qr img { height: 84px; width: 84px; object-fit: contain; }
    .thanks { text-align: center; margin-top: 16px; font-weight: 700; color: ${primary}; font-family: ${d.font.heading}; }
    .contact { text-align: center; margin-top: 10px; font-size: 10px; color: ${d.colors.footer}; }
    .copyright { text-align: center; margin-top: 4px; font-size: 9px; color: ${d.colors.footer}; opacity: 0.8; }
    .status { display:inline-block; padding:3px 10px; border-radius:${radius || 6}px; font-weight:700; font-size:10px; background:${d.colors.accent ? `${d.colors.accent}22` : "#eef2ff"}; color:${d.colors.accent || "#4338ca"}; }
    .wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; overflow: hidden; }
    .wm span { font-size: 90px; font-weight: 800; color:#111827; opacity: 0.06; transform: rotate(-30deg); white-space: nowrap; letter-spacing: 10px; }
    .wm img { max-width: 60%; max-height: 60%; opacity: 0.07; transform: rotate(-30deg); }
    .content { position: relative; z-index: 1; }
    .logo { height: 46px; max-width: 180px; object-fit: contain; margin-bottom: 6px; display:block; }
    .head-centered .logo { margin-left: auto; margin-right: auto; }
    .seal { height: 54px; object-fit: contain; display:inline-block; }
    .sig { height: 38px; object-fit: contain; display:block; margin: 0 auto; }
  </style></head><body>
  ${b.hasWatermark ? `<div class="wm">${b.watermarkImage ? `<img src="${b.watermarkImage}" onerror="this.style.display='none'" />` : `<span>${esc(b.watermarkText)}</span>`}</div>` : ""}
  <div class="content">
  ${head}
  <div class="grid">
    ${gridInner}
  </div>
  <table>${colgroup}<thead><tr>${cols.map(colHead).join("")}</tr></thead><tbody>${rows}</tbody></table>
  <table class="totals">${totalsRows2}</table>
  ${wordsBlock}
  <div class="foot">
    <div style="flex:1">${footLeft}</div>
    ${qrBlock}
    ${signBlock}
  </div>
  ${thankYou}
  ${contactBlock}
  ${copyrightBlock}
  ${footerTextBlock}
  </div>
  ${printScript}
  </body></html>`;
}
var TEXT_EDITABLE_TYPES = [
  "text",
  "customSection",
  "companyDetails",
  "customerDetails",
  "bankDetails",
  "paymentInfo",
  "terms",
  "notes",
  "signature",
  "stamp"
];
function isTextEditable(type) {
  return TEXT_EDITABLE_TYPES.includes(type);
}
function textPropOf(type) {
  return type === "text" || type === "customSection" ? "content" : "text";
}
function getElementText(el) {
  const v = el[textPropOf(el.type)];
  return typeof v === "string" ? v : "";
}
function hasElementText(el) {
  return isTextEditable(el.type) && getElementText(el).trim() !== "";
}
function fillCanvasTokens(text, inv, company) {
  const companyGst = company?.gstNumber || company?.gstin || "";
  const companyEmail = company?.email || company?.contactEmail || company?.adminEmail || "";
  const map = {
    customername: inv?.billToName || "",
    customeraddress: inv?.billToAddress || "",
    customeremail: inv?.billToEmail || "",
    customerphone: inv?.billToPhone || "",
    customergst: inv?.billToGstin || "",
    invoicenumber: inv?.invoiceNumber || "",
    invoicedate: inv?.invoiceDate || "",
    duedate: inv?.dueDate || "",
    ponumber: inv?.poNumber || "",
    paymentmode: inv?.paymentMode || "",
    paymentterms: inv?.paymentTerms || "",
    upiid: inv?.upiId || "",
    companyname: company?.name || "",
    // Operating location of the issuing workspace ("Head Office" / "X Branch").
    branchname: company?.branchLabel || "",
    companyaddress: company?.address || "",
    companyemail: companyEmail,
    companyphone: company?.phone || company?.contactNumber || "",
    companygst: companyGst,
    gstin: companyGst,
    bankname: company?.bankName || "",
    ifsc: company?.ifscCode || "",
    accountnumber: company?.bankAccountNumber || "",
    bankdetails: inv?.bankDetails || "",
    terms: inv?.termsConditions || "",
    notes: inv?.notes || "",
    pagenumber: "1",
    totalpages: "1",
    customfield1: inv?.customField1 || ""
  };
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) => {
    const v = map[key.toLowerCase()];
    return v === void 0 ? whole : esc(v).replace(/\n/g, "<br/>");
  });
}
function canvasTextHtml(el, inv, company) {
  return fillCanvasTokens(getElementText(el), inv, company).replace(/\n/g, "<br/>");
}
var TOTALS_ROWS = [
  { key: "subtotal", label: "Subtotal" },
  { key: "discount", label: "Discount" },
  { key: "taxable", label: "Taxable Amount" },
  { key: "cgst", label: "CGST" },
  { key: "sgst", label: "SGST" },
  { key: "igst", label: "IGST" },
  { key: "roundOff", label: "Round Off" },
  { key: "grandTotal", label: "Grand Total" },
  { key: "amountInWords", label: "Amount in Words" }
];
function totalsLabel(el, key) {
  const custom = el.totalsLabels?.[key];
  if (typeof custom === "string" && custom.trim() !== "") return custom;
  return TOTALS_ROWS.find((r) => r.key === key)?.label || key;
}
function paymentInfoRows(inv) {
  const mode = String(inv?.paymentMode ?? "").trim();
  const upi = String(inv?.upiId ?? "").trim();
  return { mode, upi, has: !!(mode || upi) };
}
function resolvePadding(el) {
  const base = el.padding;
  const sides = [el.paddingTop, el.paddingRight, el.paddingBottom, el.paddingLeft];
  if (base === void 0 && sides.every((v) => v === void 0)) return null;
  return sides.map((v) => Number(v ?? base ?? 0));
}
function layoutIsElementModel(layout) {
  const blocks = layout?.blocks ?? layout?.elements;
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  const b = blocks[0] || {};
  if ("zIndex" in b) return true;
  if ("z" in b || "style" in b) return false;
  return true;
}
function canvasDesignFromLayout(layout) {
  const elements = Array.isArray(layout?.blocks) ? layout.blocks : Array.isArray(layout?.elements) ? layout.elements : [];
  return {
    isCanvas: true,
    template: "canvas",
    title: "TAX INVOICE",
    paper: "A4",
    orientation: "portrait",
    elements,
    colors: {},
    font: {},
    layout: {},
    totals: {},
    header: {},
    customer: {},
    footer: {},
    columns: [],
    tableBorders: false,
    altRows: false,
    altRowColor: "",
    totalsPosition: "right"
  };
}
function renderCanvasHtml(inv, company, design, opts) {
  const b = resolveBranding(company);
  const elements = design.elements || [];
  const pageSize = `${design.paper || "A4"} ${design.orientation || "portrait"}`;
  const fontsLink = googleFontsLink(webFontsUsed(elements));
  const printScript = opts.print === false ? "" : `<script>window.onload=function(){
    var go=function(){setTimeout(function(){window.print();},60);};
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go).catch(go); else go();
  }</script>`;
  let html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNumber)}</title>
  ${fontsLink}
  <style>
    @page { size: ${pageSize}; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; position: relative; width: 100%; height: 100%; display: flex; justify-content: center; }
    .canvas-container { position: relative; width: 794px; height: 1123px; overflow: hidden; background: white; }
    .el { position: absolute; word-wrap: break-word; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; font-size: 0.9em; }
    th { background: #f8fafc; font-weight: bold; }
    .r { text-align: right; }
    /* The same rules the editor canvas applies \u2014 see richText.canvasTextCss. */
    ${canvasTextCss(".el")}
  </style></head><body><div class="canvas-container">`;
  const sorted = [...elements].sort((a, b2) => a.zIndex - b2.zIndex);
  for (const el of sorted) {
    if (!el.visible) continue;
    let style = `left: ${el.x}px; top: ${el.y}px; width: ${el.w}px; height: ${el.h}px; z-index: ${el.zIndex};`;
    if (el.rotation) style += ` transform: rotate(${el.rotation}deg);`;
    if (el.opacity !== void 0) style += ` opacity: ${el.opacity};`;
    if (el.fontFamily) style += ` font-family: ${el.fontFamily};`;
    if (el.fontSize) style += ` font-size: ${el.fontSize}px;`;
    if (el.fontWeight) style += ` font-weight: ${el.fontWeight};`;
    if (el.fontStyle) style += ` font-style: ${el.fontStyle};`;
    if (el.textDecoration) style += ` text-decoration: ${el.textDecoration};`;
    if (el.textTransform && el.textTransform !== "none") style += ` text-transform: ${el.textTransform};`;
    if (el.textAlign) style += ` text-align: ${el.textAlign};`;
    if (el.color) style += ` color: ${el.color};`;
    if (el.letterSpacing) style += ` letter-spacing: ${el.letterSpacing}px;`;
    if (el.lineHeight) style += ` line-height: ${el.lineHeight};`;
    if (el.bg) style += ` background-color: ${el.bg};`;
    if (el.borderWidth) style += ` border-width: ${el.borderWidth}px;`;
    if (el.borderColor) style += ` border-color: ${el.borderColor};`;
    if (el.borderStyle) style += ` border-style: ${el.borderStyle};`;
    if (el.borderRadius) style += ` border-radius: ${el.borderRadius}px;`;
    const pad = resolvePadding(el);
    if (pad) style += ` padding: ${pad.map((v) => `${v}px`).join(" ")};`;
    let innerHtml = "";
    switch (el.type) {
      case "text":
      case "customSection": {
        innerHtml = canvasTextHtml(el, inv, company);
        break;
      }
      case "rect":
      case "circle":
        if (el.type === "circle") style += " border-radius: 50%;";
        break;
      case "line":
        style += " border-top-width: " + (el.borderWidth || 1) + "px; border-top-style: " + (el.borderStyle || "solid") + "; border-top-color: " + (el.borderColor || "#000") + ";";
        style += " height: 0 !important; overflow: visible;";
        break;
      case "image":
        innerHtml = `<img src="${el.src || ""}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'" />`;
        break;
      case "stamp": {
        const labelled = hasElementText(el);
        const imgH = labelled ? "70%" : "100%";
        innerHtml = `<img src="${el.src || ""}" style="width:100%; height:${imgH}; object-fit:contain;" onerror="this.style.display='none'" />`;
        if (labelled) innerHtml += `<div>${canvasTextHtml(el, inv, company)}</div>`;
        break;
      }
      case "logo":
        if (b.hasLogo) innerHtml = `<img src="${b.logo}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'" />`;
        break;
      case "signature": {
        const labelled = hasElementText(el);
        const imgH = labelled ? "70%" : "100%";
        if (b.hasSignature) innerHtml = `<img src="${b.signature}" style="width:100%; height:${imgH}; object-fit:contain;" onerror="this.style.display='none'" />`;
        if (labelled) innerHtml += `<div>${canvasTextHtml(el, inv, company)}</div>`;
        break;
      }
      case "qr":
        if (opts.qrDataUrl) innerHtml = `<img src="${opts.qrDataUrl}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'" />`;
        break;
      case "barcode":
        innerHtml = `<div style="width:100%; height:100%; border:1px solid #ccc; display:flex; align-items:center; justify-content:center;">|||||||||||||||</div>`;
        break;
      case "companyDetails":
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company) : `<strong>${esc(company?.name || "Company Name")}</strong><br/>
          ${esc(company?.address || "")}<br/>
          ${company?.gstin ? `GSTIN: ${esc(company.gstin)}<br/>` : ""}
          ${company?.email ? `${esc(company.email)}<br/>` : ""}
          ${company?.phone ? `${esc(company.phone)}<br/>` : ""}
          ${company?.branchLabel ? `<span style="font-weight:700">Branch: ${esc(company.branchLabel)}</span>` : ""}`;
        break;
      case "customerDetails":
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company) : `<strong>${esc(inv.billToName || "Customer")}</strong><br/>
          ${esc(inv.billToAddress || "")}<br/>
          ${inv.billToGstin ? `GSTIN: ${esc(inv.billToGstin)}<br/>` : ""}
          ${inv.billToEmail ? `${esc(inv.billToEmail)}<br/>` : ""}
          ${inv.billToPhone ? `${esc(inv.billToPhone)}` : ""}`;
        break;
      case "itemTable":
        {
          const cols = (el.tableCols || DEFAULT_COLUMNS).filter((c) => c.visible);
          let ths = cols.map((c) => {
            const r = ["qty", "rate", "disc", "gst", "amount"].includes(c.key) ? ' class="r"' : "";
            return `<th${r} style="width:${c.width ? c.width + "%" : "auto"}">${esc(c.label)}</th>`;
          }).join("");
          let trs = (inv.items || []).map((it, i) => {
            return `<tr>${cols.map((c) => colCell(c, it, i)).join("")}</tr>`;
          }).join("");
          innerHtml = `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
        }
        break;
      case "totals":
        {
          const rows = [];
          const tr = el.totalsRows || { subtotal: true, grandTotal: true };
          const L = (k) => esc(totalsLabel(el, k));
          if (tr.subtotal) rows.push(`<tr><td>${L("subtotal")}</td><td class="r">${money(inv.subtotal)}</td></tr>`);
          if (tr.discount) rows.push(`<tr><td>${L("discount")}</td><td class="r">\u2212 ${money(inv.discountTotal)}</td></tr>`);
          if (tr.taxable) rows.push(`<tr><td>${L("taxable")}</td><td class="r">${money(inv.taxableAmount)}</td></tr>`);
          if (tr.tax) {
            if (inv.cgst > 0) {
              rows.push(`<tr><td>${L("cgst")}</td><td class="r">${money(inv.cgst)}</td></tr>`);
              rows.push(`<tr><td>${L("sgst")}</td><td class="r">${money(inv.sgst)}</td></tr>`);
            } else if (inv.igst > 0) {
              rows.push(`<tr><td>${L("igst")}</td><td class="r">${money(inv.igst)}</td></tr>`);
            }
          }
          if (tr.roundOff) rows.push(`<tr><td>${L("roundOff")}</td><td class="r">${money(inv.roundOff)}</td></tr>`);
          if (tr.grandTotal) rows.push(`<tr><td style="font-weight:bold">${L("grandTotal")}</td><td class="r" style="font-weight:bold">${money(inv.grandTotal)}</td></tr>`);
          if (tr.amountInWords) rows.push(`<tr><td colspan="2" style="font-size:0.9em">${L("amountInWords")}: <b>${esc(amountInWords(inv.grandTotal))}</b></td></tr>`);
          innerHtml = `<table style="border:none"><tbody>${rows.join("")}</tbody></table>`;
        }
        break;
      // Payment Details were removed from the invoice layout. A saved template
      // may still contain these elements, so they are rendered as nothing rather
      // than printing bank/UPI data. Any literal text the designer typed into the
      // block is still honoured — that is the author's own copy, not payment data.
      case "bankDetails":
      case "paymentInfo":
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company) : "";
        break;
      case "terms":
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company) : inv.termsConditions ? `<strong>Terms & Conditions</strong><br/>${esc(inv.termsConditions).replace(/\n/g, "<br/>")}` : "";
        break;
      case "notes":
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company) : inv.notes ? `<strong>Notes</strong><br/>${esc(inv.notes).replace(/\n/g, "<br/>")}` : "";
        break;
    }
    html += `<div class="el" style="${style}">${innerHtml}</div>`;
  }
  html += `</div>${printScript}</body></html>`;
  return html;
}

// frontend/src/components/invoicing/invoiceCanvas.ts
var A4_PAGE = { width: 794, height: 1123, margin: 32, background: "#ffffff", fontFamily: "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif" };
var FONT = A4_PAGE.fontFamily;
var esc2 = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
var inr = (n, cur = "\u20B9") => cur + Math.round(Number(n) || 0).toLocaleString("en-IN");
var BLOCK_LIBRARY = [
  { type: "text", label: "Text", w: 240, h: 36, content: "Text" },
  { type: "logo", label: "Logo", w: 140, h: 70 },
  { type: "company", label: "Company Details", w: 320, h: 96 },
  { type: "customer", label: "Customer Details", w: 300, h: 96 },
  { type: "itemTable", label: "Item Table", w: 730, h: 200 },
  { type: "taxSummary", label: "Tax Summary", w: 300, h: 150 },
  // Bank Details is no longer offered — Payment Details were removed from the
  // invoice layout, so a placed block would render nothing.
  { type: "qr", label: "QR Code", w: 90, h: 90 },
  { type: "barcode", label: "Barcode", w: 200, h: 60 },
  { type: "signature", label: "Signature", w: 200, h: 80 },
  { type: "stamp", label: "Stamp", w: 110, h: 110 },
  { type: "notes", label: "Notes", w: 360, h: 70 },
  { type: "terms", label: "Terms & Conditions", w: 360, h: 90 },
  { type: "divider", label: "Divider", w: 730, h: 2 },
  { type: "space", label: "Space", w: 200, h: 40 },
  { type: "image", label: "Image", w: 160, h: 120 },
  { type: "custom", label: "Custom Block", w: 260, h: 60, content: "Custom content" }
];
var BLOCK_LABEL = Object.fromEntries(BLOCK_LIBRARY.map((b) => [b.type, b.label]));
function fillTokens(text, inv, company, b) {
  const map = {
    invoice_number: inv.invoiceNumber || "",
    invoice_date: inv.invoiceDate || "",
    due_date: inv.dueDate || "",
    company_name: b.companyName || company?.name || "",
    branch_name: company?.branchLabel || "",
    customer_name: inv.billToName || "",
    grand_total: inr(inv.grandTotal, inv.currency === "INR" || !inv.currency ? "\u20B9" : ""),
    po_number: inv.poNumber || "",
    place_of_supply: inv.placeOfSupply || inv.billToState || ""
  };
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => map[k] != null ? esc2(map[k]) : m);
}
function styleCss(s = {}, extra = "") {
  const bits = [
    `font-family:${FONT}`,
    `font-size:${s.fontSize ?? 12}px`,
    `font-weight:${s.fontWeight ?? 400}`,
    s.fontStyle ? `font-style:${s.fontStyle}` : "",
    `color:${s.color || "#111827"}`,
    s.background ? `background:${s.background}` : "",
    `text-align:${s.align || "left"}`,
    `padding:${s.padding ?? 0}px`,
    s.borderWidth ? `border:${s.borderWidth}px solid ${s.borderColor || "#e5e7eb"}` : "",
    s.borderRadius ? `border-radius:${s.borderRadius}px` : "",
    `line-height:${s.lineHeight ?? 1.35}`,
    s.letterSpacing ? `letter-spacing:${s.letterSpacing}px` : "",
    "box-sizing:border-box;overflow:hidden;width:100%;height:100%",
    extra
  ].filter(Boolean);
  return bits.join(";");
}
var muted = "color:#6b7280";
function renderBlockHtml(block, ctx) {
  const { inv, company, branding: b } = ctx;
  const s = block.style || {};
  const wrap = (inner, extra = "") => `<div style="${styleCss(s, extra)}">${inner}</div>`;
  switch (block.type) {
    case "text":
    case "custom":
      return wrap(`<div style="white-space:pre-wrap">${fillTokens(block.content || "", inv, company, b)}</div>`, "display:flex;flex-direction:column;justify-content:center");
    case "logo":
      return b.hasLogo ? `<div style="${styleCss(s, "display:flex;align-items:center")}"><img src="${b.logo}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>` : wrap(`<div style="${muted};font-weight:800;font-size:16px">${esc2(b.companyName || company?.name || "LOGO")}</div>`, "display:flex;align-items:center");
    case "company":
      return wrap([
        `<div style="font-weight:800;font-size:${(s.fontSize ?? 12) + 3}px">${esc2(b.companyName || company?.name || "Company")}</div>`,
        company?.address ? `<div style="${muted}">${esc2(company.address)}</div>` : "",
        company?.gstNumber ? `<div style="${muted}">GSTIN: ${esc2(company.gstNumber)}</div>` : "",
        company?.panNumber ? `<div style="${muted}">PAN: ${esc2(company.panNumber)}</div>` : "",
        company?.email || company?.phone ? `<div style="${muted}">${esc2(company.email || "")} ${esc2(company.phone || "")}</div>` : "",
        // Operating location, below the legal identity — never a replacement for it.
        company?.branchLabel ? `<div style="font-weight:700">Branch: ${esc2(company.branchLabel)}</div>` : ""
      ].filter(Boolean).join(""));
    case "customer":
      return wrap([
        `<div style="${muted};font-weight:700;text-transform:uppercase;font-size:10px">Bill To</div>`,
        `<div style="font-weight:700">${esc2(inv.billToName || "")}</div>`,
        inv.billToAddress ? `<div style="${muted}">${esc2(inv.billToAddress)}</div>` : "",
        inv.billToGstin ? `<div style="${muted}">GSTIN: ${esc2(inv.billToGstin)}</div>` : "",
        inv.billToEmail || inv.billToPhone ? `<div style="${muted}">${esc2(inv.billToEmail || "")} ${esc2(inv.billToPhone || "")}</div>` : ""
      ].filter(Boolean).join(""));
    case "itemTable": {
      const cur = inv.currency === "INR" || !inv.currency ? "\u20B9" : "";
      const rows = (inv.items || []).map((it, i) => `
        <tr>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:center">${i + 1}</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px">${esc2(it.name || "")}${it.description ? `<div style="${muted};font-size:10px">${esc2(it.description)}</div>` : ""}</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:center">${esc2(it.hsnSac || "")}</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:right">${esc2(it.quantity ?? "")} ${esc2(it.unit || "")}</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:right">${inr(it.rate, cur)}</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:right">${esc2(it.discountPct || 0)}%</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:right">${esc2(it.taxRate || 0)}%</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:right">${inr(it.amount, cur)}</td>
        </tr>`).join("");
      const head = ["#", "Item", "HSN/SAC", "Qty", "Rate", "Disc", "GST", "Amount"].map((h, i) => `<th style="border:1px solid #d1d5db;padding:5px 6px;background:#f1f5f9;text-align:${i >= 3 ? "right" : i === 0 ? "center" : "left"};font-size:10px;text-transform:uppercase">${h}</th>`).join("");
      return `<div style="${styleCss(s, "overflow:auto")}"><table style="width:100%;border-collapse:collapse;font-family:${FONT};font-size:${s.fontSize ?? 11}px">
        <thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    case "taxSummary": {
      const cur = inv.currency === "INR" || !inv.currency ? "\u20B9" : "";
      const row = (l, v, strong = false) => `<div style="display:flex;justify-content:space-between;${strong ? "font-weight:800" : muted}"><span>${l}</span><span>${inr(v, cur)}</span></div>`;
      const taxRows = inv.igst > 0 ? row("IGST", inv.igst) : `${row("CGST", inv.cgst)}${row("SGST", inv.sgst)}`;
      return wrap([
        row("Subtotal", inv.subtotal),
        inv.discountTotal > 0 ? row("Discount", -inv.discountTotal) : "",
        row("Taxable", inv.taxableAmount),
        taxRows,
        inv.roundOff ? row("Round Off", inv.roundOff) : "",
        `<div style="border-top:1px solid #d1d5db;margin-top:4px;padding-top:4px">${row("Grand Total", inv.grandTotal, true)}</div>`,
        `<div style="${muted};font-size:10px;margin-top:4px">${esc2(amountInWords(inv.grandTotal))}</div>`
      ].filter(Boolean).join(""));
    }
    // Payment Details were removed from the invoice layout. Older saved layouts
    // may still carry a bank block; it now renders nothing rather than printing
    // account and UPI data.
    case "bank":
      return "";
    case "signature":
      return `<div style="${styleCss(s, "display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end")}">
        ${b.hasSignature ? `<img src="${b.signature}" style="max-height:60%;max-width:80%;object-fit:contain"/>` : ""}
        <div style="border-top:1px solid #9ca3af;min-width:120px;text-align:center;padding-top:2px;${muted}">${esc2(b.signatureText || "Authorized Signatory")}</div>
      </div>`;
    case "stamp":
      return b.hasSeal ? `<div style="${styleCss(s, "display:flex;align-items:center;justify-content:center")}"><img src="${b.seal}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>` : wrap(`<div style="border:1.5px dashed #d1d5db;border-radius:50%;width:100%;height:100%;display:flex;align-items:center;justify-content:center;${muted};font-size:10px">STAMP</div>`);
    case "notes":
      return wrap([`<div style="font-weight:700">Notes</div>`, `<div style="${muted};white-space:pre-wrap">${esc2(inv.notes || block.content || "")}</div>`].join(""));
    case "terms":
      return wrap([`<div style="font-weight:700">Terms &amp; Conditions</div>`, `<div style="${muted};white-space:pre-wrap">${esc2(inv.termsConditions || block.content || "")}</div>`].join(""));
    case "divider":
      return `<div style="width:100%;height:100%;background:${s.background || s.color || "#d1d5db"}"></div>`;
    case "space":
      return `<div style="width:100%;height:100%"></div>`;
    case "qr":
      return ctx.qrDataUrl ? `<div style="${styleCss(s, "display:flex;align-items:center;justify-content:center")}"><img src="${ctx.qrDataUrl}" style="width:100%;height:100%;object-fit:contain"/></div>` : wrap(`<div style="border:1px dashed #d1d5db;width:100%;height:100%;display:flex;align-items:center;justify-content:center;${muted};font-size:10px">QR</div>`);
    case "barcode":
      return ctx.barcodeDataUrl ? `<div style="${styleCss(s, "display:flex;align-items:center;justify-content:center")}"><img src="${ctx.barcodeDataUrl}" style="width:100%;height:100%;object-fit:contain"/></div>` : wrap(`<div style="border:1px dashed #d1d5db;width:100%;height:100%;display:flex;align-items:center;justify-content:center;${muted};font-size:10px">BARCODE</div>`);
    case "image":
      return block.content ? `<div style="${styleCss(s, "display:flex;align-items:center;justify-content:center")}"><img src="${block.content}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>` : wrap(`<div style="border:1px dashed #d1d5db;width:100%;height:100%;display:flex;align-items:center;justify-content:center;${muted};font-size:10px">IMAGE</div>`);
    default:
      return wrap("");
  }
}
function renderLayoutInner(layout, ctx) {
  const blocks = (layout.blocks || []).filter((bl) => bl.visible !== false).slice().sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  return blocks.map((bl) => `<div style="position:absolute;left:${bl.x}px;top:${bl.y}px;width:${bl.w}px;height:${bl.h}px;z-index:${bl.z ?? 0}">${renderBlockHtml(bl, ctx)}</div>`).join("");
}
function canvasDocHtml(inv, company, layout, opts = {}) {
  const page = { ...A4_PAGE, ...layout.page || {} };
  const branding = resolveBranding(company);
  const inner = renderLayoutInner(layout, { inv, company, branding, qrDataUrl: opts.qrDataUrl, barcodeDataUrl: opts.barcodeDataUrl });
  const printScript = opts.print ? "<script>window.onload=function(){setTimeout(function(){window.print();},120);}</script>" : "";
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc2(inv.invoiceNumber || "Invoice")}</title>
    <style>
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#eef2f6;font-family:${page.fontFamily}}
      .page{position:relative;width:${page.width}px;height:${page.height}px;background:${page.background || "#fff"};margin:0 auto;box-shadow:0 2px 16px rgba(0,0,0,.12);overflow:hidden}
      @media print{ html,body{background:#fff} .page{box-shadow:none;margin:0} @page{size:A4;margin:0} }
    </style></head>
    <body><div class="page">${inner}</div>${printScript}</body></html>`;
}
var M = A4_PAGE.margin;
var RIGHT = A4_PAGE.width - M;

// frontend/src/components/invoicing/serviceInvoice.ts
var ONES2 = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen"
];
var TENS2 = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
var two2 = (n) => n < 20 ? ONES2[n] : TENS2[Math.floor(n / 10)] + (n % 10 ? ` ${ONES2[n % 10]}` : "");
var three2 = (n) => {
  const h = Math.floor(n / 100), rest = n % 100;
  return `${h ? `${ONES2[h]} Hundred${rest ? " " : ""}` : ""}${rest ? two2(rest) : ""}`;
};
function numberToWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  return [
    crore ? `${three2(crore)} Crore` : "",
    lakh ? `${three2(lakh)} Lakh` : "",
    thousand ? `${three2(thousand)} Thousand` : "",
    n ? three2(n) : ""
  ].filter(Boolean).join(" ").trim();
}
function amountInWords2(amount) {
  const v = Math.abs(Number(amount) || 0);
  const rupees = Math.floor(v);
  const paise = Math.round((v - rupees) * 100);
  const head = `Rupees ${numberToWords(rupees)}`;
  return paise ? `${head} and ${numberToWords(paise)} Paise Only` : `${head} Only`;
}
var A4_W = 794;
var A4_H = 1123;
var r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
var nn = (n) => Math.max(0, Number(n) || 0);
var inr2 = (n) => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function computeInvoice(items, intraState) {
  const lines = (items || []).map((it) => {
    const quantity = nn(it.quantity);
    const rate = nn(it.rate);
    const gross = r2(quantity * rate);
    const discountPct = nn(it.discountPct);
    let discountAmt = it.discountAmt != null && it.discountAmt !== "" ? nn(it.discountAmt) : r2(gross * discountPct / 100);
    if (discountAmt > gross) discountAmt = gross;
    const taxableValue = r2(gross - discountAmt);
    const taxRate = nn(it.taxRate);
    const totalTax = r2(taxableValue * taxRate / 100);
    const cgst2 = intraState ? r2(totalTax / 2) : 0;
    const sgst2 = intraState ? r2(totalTax - cgst2) : 0;
    const igst2 = intraState ? 0 : totalTax;
    return {
      ...it,
      quantity,
      rate,
      discountPct,
      discountAmt: r2(discountAmt),
      taxableValue,
      taxRate,
      taxAmount: totalTax,
      cgst: cgst2,
      sgst: sgst2,
      igst: igst2,
      amount: r2(taxableValue + totalTax),
      gross,
      taxable: taxableValue
    };
  });
  const sum = (k) => r2(lines.reduce((s, l) => s + (Number(l[k]) || 0), 0));
  const subtotal = r2(lines.reduce((s, l) => s + l.quantity * l.rate, 0));
  const taxableAmount = sum("taxableValue");
  const cgst = sum("cgst"), sgst = sum("sgst"), igst = sum("igst");
  const preRound = r2(taxableAmount + cgst + sgst + igst);
  const grandTotal = Math.round(preRound);
  return {
    lines,
    subtotal,
    discountTotal: sum("discountAmt"),
    taxableAmount,
    cgst,
    sgst,
    igst,
    taxTotal: r2(cgst + sgst + igst),
    roundOff: r2(grandTotal - preRound),
    grandTotal: Math.max(0, grandTotal)
  };
}
var outstandingOf = (grandTotal, amountPaid) => r2(Math.max(0, r2(grandTotal) - r2(amountPaid)));
var NOT_CONFIGURED = "Not Configured";
var NO_SIGNATURE = "No Signature Uploaded";
var isImageSrc = (v) => {
  const s = String(v ?? "").trim();
  return /^data:image\//i.test(s) || /^https?:\/\//i.test(s) || s.startsWith("/") && /\.(png|jpe?g|svg|webp|gif)$/i.test(s);
};
var img = (...candidates) => candidates.map((v) => String(v ?? "").trim()).find(isImageSrc) || "";
var first = (...candidates) => candidates.map((v) => String(v ?? "").trim()).find(Boolean) || "";
function resolveIssuer(company, settings, override) {
  const c = company || {}, s = settings || {};
  let o = {};
  if (override) {
    try {
      o = typeof override === "string" ? JSON.parse(override) : override;
    } catch {
      o = {};
    }
  }
  if (!o || typeof o !== "object") o = {};
  const line1 = first(c.address, c.registeredOfficeAddress, c.headOfficeAddress, c.corporateAddress, c.billingAddress, c.addressLine1);
  const line2 = [c.city, c.state, c.pincode || c.zipCode, c.country].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  const address = [line1, line2].filter(Boolean).join(", ");
  const composedBank = [
    c.bankName && `Bank: ${c.bankName}`,
    c.accountHolderName && `Account Name: ${c.accountHolderName}`,
    c.bankAccountNumber && `Account No.: ${c.bankAccountNumber}`,
    c.ifscCode && `IFSC: ${c.ifscCode}`,
    c.bankBranch && `Branch: ${c.bankBranch}`
  ].filter(Boolean).join("\n");
  return {
    // Images — override → billing default → Company Profile. Each candidate is
    // validated, so a broken <img> can never be emitted.
    logo: img(o.logo, s.logoUrl, c.logoImage, c.companyLogo, c.logo),
    seal: img(o.stamp, s.stampUrl, c.stampImage, c.sealImage, c.seal),
    signature: img(o.signature, s.signatureUrl, c.digitalSignatureImage, c.signatureImage, c.authorizedSignatureImage),
    qr: img(o.qr, s.qrUrl, c.paymentQrImage, c.qrImage),
    signatureText: first(c.signatureText, c.authorizedSignatory && `${c.authorizedSignatory}${c.signatoryDesignation ? `, ${c.signatoryDesignation}` : ""}`),
    // The legal entity. `company` is already parent-resolved by invoiceIdentity —
    // a branch name can never land here — and `branchLabel` names the operating
    // location underneath it.
    name: first(c.name, c.companyName, "Your Company"),
    branchLabel: first(c.branchLabel),
    address,
    phone: first(c.phone, c.contactNumber, c.mobile),
    email: first(c.contactEmail, c.email, c.adminEmail, c.supportEmail),
    website: first(c.website),
    gstin: first(s.companyGstin, c.gstNumber, c.gstin),
    pan: first(c.panNumber, c.pan),
    cin: first(c.cinNumber, c.cin),
    bankDetails: first(s.bankDetails, composedBank),
    upiId: first(s.upiId, c.upiId),
    footerText: first(s.footerText, "This is a computer-generated invoice and does not require a signature."),
    notes: first(s.defaultNotes),
    terms: first(s.defaultTerms, c.paymentTerms),
    accent: first(s.themeColor, "#1f2937")
  };
}
var SERVICE_INVOICE_CSS = `
.si-page{width:${A4_W}px;min-height:${A4_H}px;background:#fff;color:#111827;
  font-family:"Segoe UI",Roboto,Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;
  box-sizing:border-box;padding:22px 24px 18px;display:flex;flex-direction:column}
.si-page *{box-sizing:border-box}
.si-frame{border:1.5px solid #111827;flex:1;display:flex;flex-direction:column}
.si-head{display:flex;border-bottom:1.5px solid #111827}
.si-head-l{flex:1.35;padding:10px 12px;border-right:1.5px solid #111827}
.si-head-r{flex:1;padding:0}
.si-logo{max-height:46px;max-width:170px;object-fit:contain;margin-bottom:6px;display:block}
.si-co-name{font-size:16px;font-weight:800;letter-spacing:.2px;line-height:1.2}
.si-co-branch{font-size:10.5px;font-weight:700;color:#374151;letter-spacing:.2px;margin-top:5px;
  padding-top:4px;border-top:1px dashed #d1d5db}
.si-co-line{font-size:10.5px;color:#374151;margin-top:2px}
.si-co-stat{font-size:10.5px;font-weight:700;margin-top:4px}
.si-title{background:#111827;color:#fff;text-align:center;font-size:13px;font-weight:800;
  letter-spacing:2px;padding:6px 0}
.si-meta{width:100%;border-collapse:collapse}
.si-meta td{border-top:1px solid #d1d5db;padding:3px 8px;font-size:10.5px;vertical-align:top}
.si-meta td.k{width:44%;color:#4b5563;font-weight:600;border-right:1px solid #d1d5db}
.si-meta td.v{font-weight:700}
.si-bill{display:flex;border-bottom:1.5px solid #111827}
.si-bill-l{flex:1.35;padding:8px 12px;border-right:1.5px solid #111827}
.si-bill-r{flex:1;padding:8px 12px}
.si-lbl{font-size:9px;font-weight:800;letter-spacing:1px;color:#6b7280;text-transform:uppercase;margin-bottom:3px}
.si-bill-name{font-size:12.5px;font-weight:800}
.si-bill-line{font-size:10.5px;color:#374151}
.si-items{width:100%;border-collapse:collapse;table-layout:fixed}
.si-items th{background:#f3f4f6;border-bottom:1.5px solid #111827;border-right:1px solid #d1d5db;
  padding:6px 6px;font-size:9.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#111827}
.si-items td{border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:6px;font-size:10.5px;vertical-align:top}
.si-items th:last-child,.si-items td:last-child{border-right:none}
.si-items .num{text-align:right;font-variant-numeric:tabular-nums}
.si-items .ctr{text-align:center}
.si-desc{font-weight:700;word-break:break-word}
.si-sub{font-size:9.5px;color:#6b7280;white-space:pre-wrap;word-break:break-word;margin-top:2px}
.si-foot{display:flex;border-top:1.5px solid #111827;margin-top:auto}
.si-foot-l{flex:1.35;border-right:1.5px solid #111827;padding:8px 12px}
.si-foot-r{flex:1}
.si-tot{width:100%;border-collapse:collapse}
.si-tot td{padding:4px 10px;font-size:10.5px;border-bottom:1px solid #e5e7eb}
.si-tot td.k{color:#374151}
.si-tot td.v{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;width:42%}
.si-tot tr.grand td{background:#111827;color:#fff;font-size:12.5px;font-weight:800;border-bottom:none;padding:7px 10px}
.si-tot tr.due td{background:#fef2f2;color:#991b1b;font-weight:800}
.si-words{border-top:1.5px solid #111827;border-bottom:1.5px solid #111827;padding:6px 12px;font-size:10.5px}
.si-words b{text-transform:uppercase;font-size:9px;letter-spacing:1px;color:#6b7280}
.si-bank{display:flex;border-bottom:1.5px solid #111827}
.si-bank-l{flex:1.35;padding:8px 12px;border-right:1.5px solid #111827}
.si-bank-r{flex:1;padding:8px 12px;display:flex;gap:10px;align-items:flex-start}
.si-kv{font-size:10.5px;display:flex;gap:6px}
.si-kv span:first-child{color:#6b7280;min-width:74px}
.si-kv span:last-child{font-weight:700}
.si-qr{width:74px;height:74px;border:1px dashed #9ca3af;border-radius:4px;display:flex;
  align-items:center;justify-content:center;font-size:8px;color:#9ca3af;text-align:center;flex:0 0 auto}
.si-qr img{width:100%;height:100%;object-fit:contain}
.si-end{display:flex}
.si-end-l{flex:1.35;padding:8px 12px;border-right:1.5px solid #111827}
.si-end-r{flex:1;padding:8px 12px;text-align:center;display:flex;flex-direction:column;justify-content:space-between}
.si-terms{font-size:9.5px;color:#374151;white-space:pre-wrap;word-break:break-word}
.si-seal{width:78px;height:78px;border:1px dashed #9ca3af;border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-size:8px;color:#9ca3af;margin:4px auto 0;text-align:center;line-height:1.2}
.si-sign{height:38px;object-fit:contain;margin:0 auto;display:block}
.si-stamp{width:78px;height:78px;object-fit:contain;margin:4px auto 0;display:block}
.si-sign-name{font-size:10px;font-weight:700;color:#374151}
.si-sign-lbl{font-size:10px;font-weight:800;border-top:1px solid #111827;padding-top:3px;margin-top:6px}
/* A value that Company Profile has not supplied \u2014 stated, never an empty box. */
.si-missing{color:#9ca3af;font-style:italic;font-weight:600}
.si-note{text-align:center;font-size:9px;color:#6b7280;padding:6px 0 0}
@media print{
  @page{size:A4 portrait;margin:8mm}
  html,body{margin:0;padding:0;background:#fff}
  .si-page{width:auto;min-height:auto;padding:0;box-shadow:none}
  .si-items tr{page-break-inside:avoid}
}
`;
var esc3 = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
var nl = (s) => esc3(s).replace(/\n/g, "<br/>");
var metaRows = (inv, sacFallback) => [
  ["Invoice No.", inv.invoiceNumber],
  ["Invoice Date", inv.invoiceDate],
  ["Due Date", inv.dueDate],
  ["Contract No.", inv.contractNo],
  ["Reference No.", inv.referenceNo],
  ["P.O. No.", inv.poNumber],
  ["SAC / HSN", inv.sacHsn || sacFallback],
  ["Billing Period", inv.billingPeriod]
].filter(([, v]) => String(v ?? "").trim() !== "");
var billToLines = (inv) => [
  inv.billToAddress,
  [inv.billToCity, inv.billToState, inv.billToCountry].filter(Boolean).join(", "),
  inv.billToGstin ? `GSTIN: ${inv.billToGstin}` : "",
  inv.billToPan ? `PAN: ${inv.billToPan}` : "",
  inv.billToEmail,
  inv.billToPhone,
  inv.billToContact ? `Contact: ${inv.billToContact}` : ""
].map((x) => String(x ?? "").trim()).filter(Boolean);
var totalsRows = (t, intraState, amountPaid) => {
  const rows = [
    { k: "Subtotal", v: t.subtotal }
  ];
  if (t.discountTotal > 0) rows.push({ k: "Discount", v: -t.discountTotal });
  rows.push({ k: "Taxable Amount", v: t.taxableAmount });
  if (intraState) {
    if (t.cgst > 0) rows.push({ k: "CGST", v: t.cgst });
    if (t.sgst > 0) rows.push({ k: "SGST", v: t.sgst });
  } else if (t.igst > 0) rows.push({ k: "IGST", v: t.igst });
  if (t.roundOff !== 0) rows.push({ k: "Round Off", v: t.roundOff });
  return rows;
};
function dispatchRows(inv) {
  const v = (x) => String(x ?? "").trim();
  const cityLine = [v(inv.dispatchCity), v(inv.dispatchState), v(inv.dispatchPincode)].filter(Boolean).join(", ");
  return [
    { label: "Dispatch From", value: v(inv.dispatchFrom) },
    { label: "Address", value: v(inv.dispatchAddress) },
    { label: "City / State / PIN", value: cityLine },
    { label: "Dispatch Date", value: v(inv.dispatchDate) },
    { label: "Dispatched Through", value: v(inv.dispatchThrough) },
    { label: "Vehicle No", value: v(inv.vehicleNumber) },
    { label: "LR / AWB No", value: v(inv.lrNumber) }
  ].filter((r) => r.value);
}
function destinationRows(inv) {
  const v = (x) => String(x ?? "").trim();
  const addr = v(inv.billToShipAddress) || v(inv.billToAddress);
  const cityLine = [v(inv.shipToCity), v(inv.shipToState), v(inv.shipToPincode)].filter(Boolean).join(", ");
  return [
    { label: "Ship To", value: v(inv.shipToName) || v(inv.billToName) },
    { label: "Delivery Address", value: addr },
    { label: "City / State / PIN", value: cityLine },
    { label: "Country", value: v(inv.shipToCountry) }
  ].filter((r) => r.value);
}
function hasLogistics(inv) {
  const filled = (x) => String(x ?? "").trim() !== "";
  return [
    inv?.dispatchFrom,
    inv?.dispatchAddress,
    inv?.dispatchCity,
    inv?.dispatchState,
    inv?.dispatchPincode,
    inv?.dispatchDate,
    inv?.dispatchThrough,
    inv?.vehicleNumber,
    inv?.lrNumber,
    inv?.billToShipAddress,
    inv?.shipToName,
    inv?.shipToCity,
    inv?.shipToState,
    inv?.shipToPincode
  ].some(filled);
}
function logisticsBlockHtml(inv, opts = {}) {
  if (opts.showLogistics === false || !hasLogistics(inv)) return "";
  const d = dispatchRows(inv);
  const s = destinationRows(inv);
  const half = (title, rows) => `
        <div class="si-lbl">${title}</div>
        ${rows.length ? rows.map((r) => `<div class="si-kv"><span style="min-width:104px">${esc3(r.label)}</span><span>${nl(r.value)}</span></div>`).join("") : '<div class="si-bill-line" style="color:#9ca3af">\u2014</div>'}`;
  return `<div class="si-bill">
      <div class="si-bill-l">${half("Dispatch Details", d)}</div>
      <div class="si-bill-r">${half("Destination Details", s)}</div>
    </div>`;
}
function serviceInvoiceHtml(inv, company, settings, opts = {}) {
  const iss = resolveIssuer(company, settings, inv.brandingOverride);
  const intraState = inv.intraState !== false;
  const items = Array.isArray(inv.items) ? inv.items : [];
  const t = computeInvoice(items, intraState);
  const paid = r2(inv.amountPaid);
  const due = outstandingOf(t.grandTotal, paid);
  const sac = items.map((i) => i.hsnSac).filter(Boolean)[0] || "";
  const meta = metaRows(inv, sac).map(([k, v]) => `<tr><td class="k">${esc3(k)}</td><td class="v">${esc3(v)}</td></tr>`).join("");
  const rows = t.lines.map((l, i) => `
    <tr>
      <td class="ctr">${i + 1}</td>
      <td><div class="si-desc">${esc3(l.name || "Service")}</div>${l.description ? `<div class="si-sub">${nl(l.description)}</div>` : ""}${l.hsnSac ? `<div class="si-sub">SAC/HSN: ${esc3(l.hsnSac)}</div>` : ""}</td>
      <td class="num">${inr2(l.rate)}</td>
      <td class="ctr">${inr2(l.quantity)}${l.unit ? ` ${esc3(l.unit)}` : ""}</td>
      <td class="ctr">${l.discountPct ? `${inr2(l.discountPct)}%` : "\u2014"}</td>
      <td class="num">${inr2(l.taxableValue)}</td>
      <td class="ctr">${inr2(l.taxRate)}%</td>
      <td class="num">${inr2(l.taxAmount)}</td>
      <td class="num">${inr2(l.amount)}</td>
    </tr>`).join("");
  const totals = totalsRows(t, intraState, paid).map((r) => `<tr><td class="k">${esc3(r.k)}</td><td class="v">${r.v < 0 ? `- ${inr2(Math.abs(r.v))}` : inr2(r.v)}</td></tr>`).join("");
  const paidRows = paid > 0 ? `<tr><td class="k">Amount Paid</td><td class="v">${inr2(paid)}</td></tr>
       <tr class="due"><td class="k">Outstanding / Balance</td><td class="v">${inr2(due)}</td></tr>` : "";
  const notes = String(inv.notes || "").trim();
  const terms = String(inv.termsConditions || "").trim();
  const body = `
<div class="si-page">
  <div class="si-frame">
    <div class="si-head">
      <div class="si-head-l">
        ${iss.logo ? `<img class="si-logo" src="${esc3(iss.logo)}" alt=""/>` : ""}
        <div class="si-co-name">${esc3(iss.name)}</div>
        ${iss.address ? `<div class="si-co-line">${nl(iss.address)}</div>` : ""}
        ${iss.phone ? `<div class="si-co-line">Phone: ${esc3(iss.phone)}</div>` : ""}
        ${iss.email ? `<div class="si-co-line">Email: ${esc3(iss.email)}</div>` : ""}
        ${iss.website ? `<div class="si-co-line">${esc3(iss.website)}</div>` : ""}
        <div class="si-co-stat">GSTIN: ${iss.gstin ? esc3(iss.gstin) : `<span class="si-missing">${NOT_CONFIGURED}</span>`}</div>
        <div class="si-co-stat">PAN: ${iss.pan ? esc3(iss.pan) : `<span class="si-missing">${NOT_CONFIGURED}</span>`}</div>
        ${iss.cin ? `<div class="si-co-stat">CIN: ${esc3(iss.cin)}</div>` : ""}
        ${/* The operating location, stated separately BELOW the legal identity —
      never a replacement for the company name above. */
  ""}
        ${iss.branchLabel ? `<div class="si-co-branch">Branch: ${esc3(iss.branchLabel)}</div>` : ""}
      </div>
      <div class="si-head-r">
        <div class="si-title">TAX INVOICE</div>
        <table class="si-meta">${meta}</table>
      </div>
    </div>

    <div class="si-bill">
      <div class="si-bill-l">
        <div class="si-lbl">Bill To</div>
        <div class="si-bill-name">${esc3(inv.billToName || "Customer")}</div>
        ${billToLines(inv).map((l) => `<div class="si-bill-line">${nl(l)}</div>`).join("")}
      </div>
      <div class="si-bill-r">
        <div class="si-lbl">Place of Supply</div>
        <div class="si-bill-line">${esc3(inv.placeOfSupply || inv.billToState || "\u2014")}</div>
        ${inv.paymentTerms ? `<div class="si-lbl" style="margin-top:6px">Payment Terms</div><div class="si-bill-line">${esc3(inv.paymentTerms)}</div>` : ""}
      </div>
    </div>

    ${logisticsBlockHtml(inv, opts)}

    <table class="si-items">
      <thead><tr>
        <th style="width:5%">Sr</th><th style="width:31%">Particulars / Service Description</th>
        <th style="width:10%">Rate</th><th style="width:8%">Qty</th><th style="width:7%">Disc %</th>
        <th style="width:11%">Taxable</th>
        <th style="width:7%">GST %</th><th style="width:10%">GST Amt</th><th style="width:11%">Total</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="ctr" style="padding:18px;color:#9ca3af">No items</td></tr>'}</tbody>
    </table>

    <div class="si-foot">
      <div class="si-foot-l">
        ${notes ? `<div class="si-lbl">Notes</div><div class="si-terms">${nl(notes)}</div>` : ""}
      </div>
      <div class="si-foot-r">
        <table class="si-tot">
          ${totals}
          <tr class="grand"><td class="k" style="color:#fff">Grand Total</td><td class="v" style="color:#fff">\u20B9${inr2(t.grandTotal)}</td></tr>
          ${paidRows}
        </table>
      </div>
    </div>

    <div class="si-words"><b>Amount in Words</b><br/>${esc3(amountInWords2(t.grandTotal))}</div>

    <!-- Payment Details (bank block, payment mode, UPI ID and the QR panel) was
         removed from the invoice layout. Terms & Conditions and the signatory
         block below now sit directly under Amount in Words. -->

    <div class="si-end">
      <div class="si-end-l">
        ${terms ? `<div class="si-lbl">Terms &amp; Conditions</div><div class="si-terms">${nl(terms)}</div>` : ""}
      </div>
      <div class="si-end-r">
        <div>
          <div class="si-lbl">For ${esc3(iss.name)}</div>
          ${iss.seal ? `<img class="si-stamp" src="${esc3(iss.seal)}" alt="Company seal"/>` : '<div class="si-seal">COMPANY<br/>SEAL</div>'}
        </div>
        <div>
          ${iss.signature ? `<img class="si-sign" src="${esc3(iss.signature)}" alt="Authorised signature"/>` : `<div class="si-sign si-missing" style="display:flex;align-items:flex-end;justify-content:center">${NO_SIGNATURE}</div>`}
          ${iss.signatureText ? `<div class="si-sign-name">${esc3(iss.signatureText)}</div>` : ""}
          <div class="si-sign-lbl">Authorised Signatory</div>
        </div>
      </div>
    </div>
  </div>
  <div class="si-note">${esc3(iss.footerText)}</div>
</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc3(inv.invoiceNumber || "Invoice")}</title>
<style>*{margin:0;padding:0}body{background:#e5e7eb;display:flex;justify-content:center;padding:16px}
@media print{body{background:#fff;padding:0;display:block}}
${SERVICE_INVOICE_CSS}</style></head>
<body>${body}${opts.print ? "<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>" : ""}</body></html>`;
}

// frontend/src/components/invoicing/invoiceRender.ts
var SYSTEM_TEMPLATE_NAME = "Default Template";
var SYSTEM_TEMPLATE_CATEGORY = "Professional Tax Invoice";
function renderInvoiceHtml(inv, company, design, layout, opts = {}, settings) {
  if (layout) {
    return layoutIsElementModel(layout) ? invoiceDocHtml(inv, company, canvasDesignFromLayout(layout), opts) : canvasDocHtml(inv, company, layout, opts);
  }
  return serviceInvoiceHtml(inv, company, settings, { ...opts, showLogistics: settings?.showLogistics !== false });
}
function openInvoiceWindow(html) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}
function printInvoiceDocument(html) {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.title = "Invoice print";
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    let torn = false;
    const teardown = () => {
      if (torn) return;
      torn = true;
      window.removeEventListener("focus", onWindowFocus);
      window.clearTimeout(sweep);
      try {
        frame.remove();
      } catch {
      }
    };
    const onWindowFocus = () => window.setTimeout(teardown, 400);
    const sweep = window.setTimeout(teardown, 6e4);
    const finish = () => {
      resolve();
    };
    try {
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) {
        teardown();
        finish();
        return;
      }
      frame.onload = () => {
        try {
          win.onafterprint = teardown;
          window.addEventListener("focus", onWindowFocus);
          win.focus();
        } catch (e) {
          console.error("[invoice] print setup failed", e);
          teardown();
        } finally {
          finish();
        }
      };
      doc.open();
      doc.write(html);
      doc.close();
    } catch (e) {
      console.error("[invoice] could not prepare the print document", e);
      teardown();
      finish();
    }
  });
}
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
var slugify = (s) => String(s || "template").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "template";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SYSTEM_TEMPLATE_CATEGORY,
  SYSTEM_TEMPLATE_NAME,
  downloadFile,
  openInvoiceWindow,
  printInvoiceDocument,
  renderInvoiceHtml,
  slugify
});
/*! Bundled license information:

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
