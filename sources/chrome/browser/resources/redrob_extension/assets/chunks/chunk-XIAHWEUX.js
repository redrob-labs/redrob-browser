import {
  __commonJS,
  __export,
  __reExport,
  __toESM
} from "./chunk-I6XLRVDC.js";

// node_modules/react/cjs/react.production.js
var require_react_production = __commonJS({
  "node_modules/react/cjs/react.production.js"(exports) {
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
    exports.Activity = REACT_ACTIVITY_TYPE;
    exports.Children = Children;
    exports.Component = Component;
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.Profiler = REACT_PROFILER_TYPE;
    exports.PureComponent = PureComponent;
    exports.StrictMode = REACT_STRICT_MODE_TYPE;
    exports.Suspense = REACT_SUSPENSE_TYPE;
    exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    exports.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    exports.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    exports.cacheSignal = function() {
      return null;
    };
    exports.cloneElement = function(element, config, children) {
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
    exports.createContext = function(defaultValue) {
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
    exports.createElement = function(type, config, children) {
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
    exports.createRef = function() {
      return { current: null };
    };
    exports.forwardRef = function(render) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render };
    };
    exports.isValidElement = isValidElement;
    exports.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    exports.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    exports.startTransition = function(scope) {
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
    exports.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    exports.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    exports.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    exports.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    exports.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    exports.useDebugValue = function() {
    };
    exports.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    exports.useEffect = function(create, deps) {
      return ReactSharedInternals.H.useEffect(create, deps);
    };
    exports.useEffectEvent = function(callback) {
      return ReactSharedInternals.H.useEffectEvent(callback);
    };
    exports.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    exports.useImperativeHandle = function(ref, create, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
    };
    exports.useInsertionEffect = function(create, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create, deps);
    };
    exports.useLayoutEffect = function(create, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create, deps);
    };
    exports.useMemo = function(create, deps) {
      return ReactSharedInternals.H.useMemo(create, deps);
    };
    exports.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    exports.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    exports.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    exports.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    };
    exports.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    exports.version = "19.2.4";
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_react_production();
    } else {
      module.exports = null;
    }
  }
});

// node_modules/scheduler/cjs/scheduler.production.js
var require_scheduler_production = __commonJS({
  "node_modules/scheduler/cjs/scheduler.production.js"(exports) {
    "use strict";
    function push(heap, node) {
      var index = heap.length;
      heap.push(node);
      a: for (; 0 < index; ) {
        var parentIndex = index - 1 >>> 1, parent = heap[parentIndex];
        if (0 < compare(parent, node))
          heap[parentIndex] = node, heap[index] = parent, index = parentIndex;
        else break a;
      }
    }
    function peek(heap) {
      return 0 === heap.length ? null : heap[0];
    }
    function pop(heap) {
      if (0 === heap.length) return null;
      var first = heap[0], last = heap.pop();
      if (last !== first) {
        heap[0] = last;
        a: for (var index = 0, length = heap.length, halfLength = length >>> 1; index < halfLength; ) {
          var leftIndex = 2 * (index + 1) - 1, left = heap[leftIndex], rightIndex = leftIndex + 1, right = heap[rightIndex];
          if (0 > compare(left, last))
            rightIndex < length && 0 > compare(right, left) ? (heap[index] = right, heap[rightIndex] = last, index = rightIndex) : (heap[index] = left, heap[leftIndex] = last, index = leftIndex);
          else if (rightIndex < length && 0 > compare(right, last))
            heap[index] = right, heap[rightIndex] = last, index = rightIndex;
          else break a;
        }
      }
      return first;
    }
    function compare(a, b2) {
      var diff = a.sortIndex - b2.sortIndex;
      return 0 !== diff ? diff : a.id - b2.id;
    }
    exports.unstable_now = void 0;
    if ("object" === typeof performance && "function" === typeof performance.now) {
      localPerformance = performance;
      exports.unstable_now = function() {
        return localPerformance.now();
      };
    } else {
      localDate = Date, initialTime = localDate.now();
      exports.unstable_now = function() {
        return localDate.now() - initialTime;
      };
    }
    var localPerformance;
    var localDate;
    var initialTime;
    var taskQueue = [];
    var timerQueue = [];
    var taskIdCounter = 1;
    var currentTask = null;
    var currentPriorityLevel = 3;
    var isPerformingWork = false;
    var isHostCallbackScheduled = false;
    var isHostTimeoutScheduled = false;
    var needsPaint = false;
    var localSetTimeout = "function" === typeof setTimeout ? setTimeout : null;
    var localClearTimeout = "function" === typeof clearTimeout ? clearTimeout : null;
    var localSetImmediate = "undefined" !== typeof setImmediate ? setImmediate : null;
    function advanceTimers(currentTime) {
      for (var timer = peek(timerQueue); null !== timer; ) {
        if (null === timer.callback) pop(timerQueue);
        else if (timer.startTime <= currentTime)
          pop(timerQueue), timer.sortIndex = timer.expirationTime, push(taskQueue, timer);
        else break;
        timer = peek(timerQueue);
      }
    }
    function handleTimeout(currentTime) {
      isHostTimeoutScheduled = false;
      advanceTimers(currentTime);
      if (!isHostCallbackScheduled)
        if (null !== peek(taskQueue))
          isHostCallbackScheduled = true, isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline());
        else {
          var firstTimer = peek(timerQueue);
          null !== firstTimer && requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
        }
    }
    var isMessageLoopRunning = false;
    var taskTimeoutID = -1;
    var frameInterval = 5;
    var startTime = -1;
    function shouldYieldToHost() {
      return needsPaint ? true : exports.unstable_now() - startTime < frameInterval ? false : true;
    }
    function performWorkUntilDeadline() {
      needsPaint = false;
      if (isMessageLoopRunning) {
        var currentTime = exports.unstable_now();
        startTime = currentTime;
        var hasMoreWork = true;
        try {
          a: {
            isHostCallbackScheduled = false;
            isHostTimeoutScheduled && (isHostTimeoutScheduled = false, localClearTimeout(taskTimeoutID), taskTimeoutID = -1);
            isPerformingWork = true;
            var previousPriorityLevel = currentPriorityLevel;
            try {
              b: {
                advanceTimers(currentTime);
                for (currentTask = peek(taskQueue); null !== currentTask && !(currentTask.expirationTime > currentTime && shouldYieldToHost()); ) {
                  var callback = currentTask.callback;
                  if ("function" === typeof callback) {
                    currentTask.callback = null;
                    currentPriorityLevel = currentTask.priorityLevel;
                    var continuationCallback = callback(
                      currentTask.expirationTime <= currentTime
                    );
                    currentTime = exports.unstable_now();
                    if ("function" === typeof continuationCallback) {
                      currentTask.callback = continuationCallback;
                      advanceTimers(currentTime);
                      hasMoreWork = true;
                      break b;
                    }
                    currentTask === peek(taskQueue) && pop(taskQueue);
                    advanceTimers(currentTime);
                  } else pop(taskQueue);
                  currentTask = peek(taskQueue);
                }
                if (null !== currentTask) hasMoreWork = true;
                else {
                  var firstTimer = peek(timerQueue);
                  null !== firstTimer && requestHostTimeout(
                    handleTimeout,
                    firstTimer.startTime - currentTime
                  );
                  hasMoreWork = false;
                }
              }
              break a;
            } finally {
              currentTask = null, currentPriorityLevel = previousPriorityLevel, isPerformingWork = false;
            }
            hasMoreWork = void 0;
          }
        } finally {
          hasMoreWork ? schedulePerformWorkUntilDeadline() : isMessageLoopRunning = false;
        }
      }
    }
    var schedulePerformWorkUntilDeadline;
    if ("function" === typeof localSetImmediate)
      schedulePerformWorkUntilDeadline = function() {
        localSetImmediate(performWorkUntilDeadline);
      };
    else if ("undefined" !== typeof MessageChannel) {
      channel = new MessageChannel(), port = channel.port2;
      channel.port1.onmessage = performWorkUntilDeadline;
      schedulePerformWorkUntilDeadline = function() {
        port.postMessage(null);
      };
    } else
      schedulePerformWorkUntilDeadline = function() {
        localSetTimeout(performWorkUntilDeadline, 0);
      };
    var channel;
    var port;
    function requestHostTimeout(callback, ms) {
      taskTimeoutID = localSetTimeout(function() {
        callback(exports.unstable_now());
      }, ms);
    }
    exports.unstable_IdlePriority = 5;
    exports.unstable_ImmediatePriority = 1;
    exports.unstable_LowPriority = 4;
    exports.unstable_NormalPriority = 3;
    exports.unstable_Profiling = null;
    exports.unstable_UserBlockingPriority = 2;
    exports.unstable_cancelCallback = function(task) {
      task.callback = null;
    };
    exports.unstable_forceFrameRate = function(fps) {
      0 > fps || 125 < fps ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : frameInterval = 0 < fps ? Math.floor(1e3 / fps) : 5;
    };
    exports.unstable_getCurrentPriorityLevel = function() {
      return currentPriorityLevel;
    };
    exports.unstable_next = function(eventHandler) {
      switch (currentPriorityLevel) {
        case 1:
        case 2:
        case 3:
          var priorityLevel = 3;
          break;
        default:
          priorityLevel = currentPriorityLevel;
      }
      var previousPriorityLevel = currentPriorityLevel;
      currentPriorityLevel = priorityLevel;
      try {
        return eventHandler();
      } finally {
        currentPriorityLevel = previousPriorityLevel;
      }
    };
    exports.unstable_requestPaint = function() {
      needsPaint = true;
    };
    exports.unstable_runWithPriority = function(priorityLevel, eventHandler) {
      switch (priorityLevel) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          priorityLevel = 3;
      }
      var previousPriorityLevel = currentPriorityLevel;
      currentPriorityLevel = priorityLevel;
      try {
        return eventHandler();
      } finally {
        currentPriorityLevel = previousPriorityLevel;
      }
    };
    exports.unstable_scheduleCallback = function(priorityLevel, callback, options) {
      var currentTime = exports.unstable_now();
      "object" === typeof options && null !== options ? (options = options.delay, options = "number" === typeof options && 0 < options ? currentTime + options : currentTime) : options = currentTime;
      switch (priorityLevel) {
        case 1:
          var timeout = -1;
          break;
        case 2:
          timeout = 250;
          break;
        case 5:
          timeout = 1073741823;
          break;
        case 4:
          timeout = 1e4;
          break;
        default:
          timeout = 5e3;
      }
      timeout = options + timeout;
      priorityLevel = {
        id: taskIdCounter++,
        callback,
        priorityLevel,
        startTime: options,
        expirationTime: timeout,
        sortIndex: -1
      };
      options > currentTime ? (priorityLevel.sortIndex = options, push(timerQueue, priorityLevel), null === peek(taskQueue) && priorityLevel === peek(timerQueue) && (isHostTimeoutScheduled ? (localClearTimeout(taskTimeoutID), taskTimeoutID = -1) : isHostTimeoutScheduled = true, requestHostTimeout(handleTimeout, options - currentTime))) : (priorityLevel.sortIndex = timeout, push(taskQueue, priorityLevel), isHostCallbackScheduled || isPerformingWork || (isHostCallbackScheduled = true, isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline())));
      return priorityLevel;
    };
    exports.unstable_shouldYield = shouldYieldToHost;
    exports.unstable_wrapCallback = function(callback) {
      var parentPriorityLevel = currentPriorityLevel;
      return function() {
        var previousPriorityLevel = currentPriorityLevel;
        currentPriorityLevel = parentPriorityLevel;
        try {
          return callback.apply(this, arguments);
        } finally {
          currentPriorityLevel = previousPriorityLevel;
        }
      };
    };
  }
});

// node_modules/scheduler/index.js
var require_scheduler = __commonJS({
  "node_modules/scheduler/index.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_scheduler_production();
    } else {
      module.exports = null;
    }
  }
});

// node_modules/react-dom/cjs/react-dom.production.js
var require_react_dom_production = __commonJS({
  "node_modules/react-dom/cjs/react-dom.production.js"(exports) {
    "use strict";
    var React22 = require_react();
    function formatProdErrorMessage(code) {
      var url = "https://react.dev/errors/" + code;
      if (1 < arguments.length) {
        url += "?args[]=" + encodeURIComponent(arguments[1]);
        for (var i = 2; i < arguments.length; i++)
          url += "&args[]=" + encodeURIComponent(arguments[i]);
      }
      return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
    }
    function noop() {
    }
    var Internals = {
      d: {
        f: noop,
        r: function() {
          throw Error(formatProdErrorMessage(522));
        },
        D: noop,
        C: noop,
        L: noop,
        m: noop,
        X: noop,
        S: noop,
        M: noop
      },
      p: 0,
      findDOMNode: null
    };
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    function createPortal$1(children, containerInfo, implementation) {
      var key = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
      return {
        $$typeof: REACT_PORTAL_TYPE,
        key: null == key ? null : "" + key,
        children,
        containerInfo,
        implementation
      };
    }
    var ReactSharedInternals = React22.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    function getCrossOriginStringAs(as, input) {
      if ("font" === as) return "";
      if ("string" === typeof input)
        return "use-credentials" === input ? input : "";
    }
    exports.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Internals;
    exports.createPortal = function(children, container) {
      var key = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
      if (!container || 1 !== container.nodeType && 9 !== container.nodeType && 11 !== container.nodeType)
        throw Error(formatProdErrorMessage(299));
      return createPortal$1(children, container, null, key);
    };
    exports.flushSync = function(fn) {
      var previousTransition = ReactSharedInternals.T, previousUpdatePriority = Internals.p;
      try {
        if (ReactSharedInternals.T = null, Internals.p = 2, fn) return fn();
      } finally {
        ReactSharedInternals.T = previousTransition, Internals.p = previousUpdatePriority, Internals.d.f();
      }
    };
    exports.preconnect = function(href, options) {
      "string" === typeof href && (options ? (options = options.crossOrigin, options = "string" === typeof options ? "use-credentials" === options ? options : "" : void 0) : options = null, Internals.d.C(href, options));
    };
    exports.prefetchDNS = function(href) {
      "string" === typeof href && Internals.d.D(href);
    };
    exports.preinit = function(href, options) {
      if ("string" === typeof href && options && "string" === typeof options.as) {
        var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin), integrity = "string" === typeof options.integrity ? options.integrity : void 0, fetchPriority = "string" === typeof options.fetchPriority ? options.fetchPriority : void 0;
        "style" === as ? Internals.d.S(
          href,
          "string" === typeof options.precedence ? options.precedence : void 0,
          {
            crossOrigin,
            integrity,
            fetchPriority
          }
        ) : "script" === as && Internals.d.X(href, {
          crossOrigin,
          integrity,
          fetchPriority,
          nonce: "string" === typeof options.nonce ? options.nonce : void 0
        });
      }
    };
    exports.preinitModule = function(href, options) {
      if ("string" === typeof href)
        if ("object" === typeof options && null !== options) {
          if (null == options.as || "script" === options.as) {
            var crossOrigin = getCrossOriginStringAs(
              options.as,
              options.crossOrigin
            );
            Internals.d.M(href, {
              crossOrigin,
              integrity: "string" === typeof options.integrity ? options.integrity : void 0,
              nonce: "string" === typeof options.nonce ? options.nonce : void 0
            });
          }
        } else null == options && Internals.d.M(href);
    };
    exports.preload = function(href, options) {
      if ("string" === typeof href && "object" === typeof options && null !== options && "string" === typeof options.as) {
        var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
        Internals.d.L(href, as, {
          crossOrigin,
          integrity: "string" === typeof options.integrity ? options.integrity : void 0,
          nonce: "string" === typeof options.nonce ? options.nonce : void 0,
          type: "string" === typeof options.type ? options.type : void 0,
          fetchPriority: "string" === typeof options.fetchPriority ? options.fetchPriority : void 0,
          referrerPolicy: "string" === typeof options.referrerPolicy ? options.referrerPolicy : void 0,
          imageSrcSet: "string" === typeof options.imageSrcSet ? options.imageSrcSet : void 0,
          imageSizes: "string" === typeof options.imageSizes ? options.imageSizes : void 0,
          media: "string" === typeof options.media ? options.media : void 0
        });
      }
    };
    exports.preloadModule = function(href, options) {
      if ("string" === typeof href)
        if (options) {
          var crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
          Internals.d.m(href, {
            as: "string" === typeof options.as && "script" !== options.as ? options.as : void 0,
            crossOrigin,
            integrity: "string" === typeof options.integrity ? options.integrity : void 0
          });
        } else Internals.d.m(href);
    };
    exports.requestFormReset = function(form) {
      Internals.d.r(form);
    };
    exports.unstable_batchedUpdates = function(fn, a) {
      return fn(a);
    };
    exports.useFormState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useFormState(action, initialState, permalink);
    };
    exports.useFormStatus = function() {
      return ReactSharedInternals.H.useHostTransitionStatus();
    };
    exports.version = "19.2.4";
  }
});

// node_modules/react-dom/index.js
var require_react_dom = __commonJS({
  "node_modules/react-dom/index.js"(exports, module) {
    "use strict";
    function checkDCE() {
      if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
        return;
      }
      if (false) {
        throw new Error("^_^");
      }
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
      } catch (err) {
        console.error(err);
      }
    }
    if (true) {
      checkDCE();
      module.exports = require_react_dom_production();
    } else {
      module.exports = null;
    }
  }
});

// node_modules/react-dom/cjs/react-dom-client.production.js
var require_react_dom_client_production = __commonJS({
  "node_modules/react-dom/cjs/react-dom-client.production.js"(exports) {
    "use strict";
    var Scheduler = require_scheduler();
    var React22 = require_react();
    var ReactDOM = require_react_dom();
    function formatProdErrorMessage(code) {
      var url = "https://react.dev/errors/" + code;
      if (1 < arguments.length) {
        url += "?args[]=" + encodeURIComponent(arguments[1]);
        for (var i = 2; i < arguments.length; i++)
          url += "&args[]=" + encodeURIComponent(arguments[i]);
      }
      return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
    }
    function isValidContainer(node) {
      return !(!node || 1 !== node.nodeType && 9 !== node.nodeType && 11 !== node.nodeType);
    }
    function getNearestMountedFiber(fiber) {
      var node = fiber, nearestMounted = fiber;
      if (fiber.alternate) for (; node.return; ) node = node.return;
      else {
        fiber = node;
        do
          node = fiber, 0 !== (node.flags & 4098) && (nearestMounted = node.return), fiber = node.return;
        while (fiber);
      }
      return 3 === node.tag ? nearestMounted : null;
    }
    function getSuspenseInstanceFromFiber(fiber) {
      if (13 === fiber.tag) {
        var suspenseState = fiber.memoizedState;
        null === suspenseState && (fiber = fiber.alternate, null !== fiber && (suspenseState = fiber.memoizedState));
        if (null !== suspenseState) return suspenseState.dehydrated;
      }
      return null;
    }
    function getActivityInstanceFromFiber(fiber) {
      if (31 === fiber.tag) {
        var activityState = fiber.memoizedState;
        null === activityState && (fiber = fiber.alternate, null !== fiber && (activityState = fiber.memoizedState));
        if (null !== activityState) return activityState.dehydrated;
      }
      return null;
    }
    function assertIsMounted(fiber) {
      if (getNearestMountedFiber(fiber) !== fiber)
        throw Error(formatProdErrorMessage(188));
    }
    function findCurrentFiberUsingSlowPath(fiber) {
      var alternate = fiber.alternate;
      if (!alternate) {
        alternate = getNearestMountedFiber(fiber);
        if (null === alternate) throw Error(formatProdErrorMessage(188));
        return alternate !== fiber ? null : fiber;
      }
      for (var a = fiber, b2 = alternate; ; ) {
        var parentA = a.return;
        if (null === parentA) break;
        var parentB = parentA.alternate;
        if (null === parentB) {
          b2 = parentA.return;
          if (null !== b2) {
            a = b2;
            continue;
          }
          break;
        }
        if (parentA.child === parentB.child) {
          for (parentB = parentA.child; parentB; ) {
            if (parentB === a) return assertIsMounted(parentA), fiber;
            if (parentB === b2) return assertIsMounted(parentA), alternate;
            parentB = parentB.sibling;
          }
          throw Error(formatProdErrorMessage(188));
        }
        if (a.return !== b2.return) a = parentA, b2 = parentB;
        else {
          for (var didFindChild = false, child$0 = parentA.child; child$0; ) {
            if (child$0 === a) {
              didFindChild = true;
              a = parentA;
              b2 = parentB;
              break;
            }
            if (child$0 === b2) {
              didFindChild = true;
              b2 = parentA;
              a = parentB;
              break;
            }
            child$0 = child$0.sibling;
          }
          if (!didFindChild) {
            for (child$0 = parentB.child; child$0; ) {
              if (child$0 === a) {
                didFindChild = true;
                a = parentB;
                b2 = parentA;
                break;
              }
              if (child$0 === b2) {
                didFindChild = true;
                b2 = parentB;
                a = parentA;
                break;
              }
              child$0 = child$0.sibling;
            }
            if (!didFindChild) throw Error(formatProdErrorMessage(189));
          }
        }
        if (a.alternate !== b2) throw Error(formatProdErrorMessage(190));
      }
      if (3 !== a.tag) throw Error(formatProdErrorMessage(188));
      return a.stateNode.current === a ? fiber : alternate;
    }
    function findCurrentHostFiberImpl(node) {
      var tag = node.tag;
      if (5 === tag || 26 === tag || 27 === tag || 6 === tag) return node;
      for (node = node.child; null !== node; ) {
        tag = findCurrentHostFiberImpl(node);
        if (null !== tag) return tag;
        node = node.sibling;
      }
      return null;
    }
    var assign = Object.assign;
    var REACT_LEGACY_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.element");
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
    var REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list");
    var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
    var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
    var REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity");
    var REACT_MEMO_CACHE_SENTINEL = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference");
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
        switch (type.$$typeof) {
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
            } catch (x2) {
            }
        }
      return null;
    }
    var isArrayImpl = Array.isArray;
    var ReactSharedInternals = React22.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    var ReactDOMSharedInternals = ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    var sharedNotPendingObject = {
      pending: false,
      data: null,
      method: null,
      action: null
    };
    var valueStack = [];
    var index = -1;
    function createCursor(defaultValue) {
      return { current: defaultValue };
    }
    function pop(cursor) {
      0 > index || (cursor.current = valueStack[index], valueStack[index] = null, index--);
    }
    function push(cursor, value) {
      index++;
      valueStack[index] = cursor.current;
      cursor.current = value;
    }
    var contextStackCursor = createCursor(null);
    var contextFiberStackCursor = createCursor(null);
    var rootInstanceStackCursor = createCursor(null);
    var hostTransitionProviderCursor = createCursor(null);
    function pushHostContainer(fiber, nextRootInstance) {
      push(rootInstanceStackCursor, nextRootInstance);
      push(contextFiberStackCursor, fiber);
      push(contextStackCursor, null);
      switch (nextRootInstance.nodeType) {
        case 9:
        case 11:
          fiber = (fiber = nextRootInstance.documentElement) ? (fiber = fiber.namespaceURI) ? getOwnHostContext(fiber) : 0 : 0;
          break;
        default:
          if (fiber = nextRootInstance.tagName, nextRootInstance = nextRootInstance.namespaceURI)
            nextRootInstance = getOwnHostContext(nextRootInstance), fiber = getChildHostContextProd(nextRootInstance, fiber);
          else
            switch (fiber) {
              case "svg":
                fiber = 1;
                break;
              case "math":
                fiber = 2;
                break;
              default:
                fiber = 0;
            }
      }
      pop(contextStackCursor);
      push(contextStackCursor, fiber);
    }
    function popHostContainer() {
      pop(contextStackCursor);
      pop(contextFiberStackCursor);
      pop(rootInstanceStackCursor);
    }
    function pushHostContext(fiber) {
      null !== fiber.memoizedState && push(hostTransitionProviderCursor, fiber);
      var context = contextStackCursor.current;
      var JSCompiler_inline_result = getChildHostContextProd(context, fiber.type);
      context !== JSCompiler_inline_result && (push(contextFiberStackCursor, fiber), push(contextStackCursor, JSCompiler_inline_result));
    }
    function popHostContext(fiber) {
      contextFiberStackCursor.current === fiber && (pop(contextStackCursor), pop(contextFiberStackCursor));
      hostTransitionProviderCursor.current === fiber && (pop(hostTransitionProviderCursor), HostTransitionContext._currentValue = sharedNotPendingObject);
    }
    var prefix;
    var suffix;
    function describeBuiltInComponentFrame(name) {
      if (void 0 === prefix)
        try {
          throw Error();
        } catch (x2) {
          var match = x2.stack.trim().match(/\n( *(at )?)/);
          prefix = match && match[1] || "";
          suffix = -1 < x2.stack.indexOf("\n    at") ? " (<anonymous>)" : -1 < x2.stack.indexOf("@") ? "@unknown:0:0" : "";
        }
      return "\n" + prefix + name + suffix;
    }
    var reentry = false;
    function describeNativeComponentFrame(fn, construct) {
      if (!fn || reentry) return "";
      reentry = true;
      var previousPrepareStackTrace = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      try {
        var RunInRootFrame = {
          DetermineComponentFrameRoot: function() {
            try {
              if (construct) {
                var Fake = function() {
                  throw Error();
                };
                Object.defineProperty(Fake.prototype, "props", {
                  set: function() {
                    throw Error();
                  }
                });
                if ("object" === typeof Reflect && Reflect.construct) {
                  try {
                    Reflect.construct(Fake, []);
                  } catch (x2) {
                    var control = x2;
                  }
                  Reflect.construct(fn, [], Fake);
                } else {
                  try {
                    Fake.call();
                  } catch (x$1) {
                    control = x$1;
                  }
                  fn.call(Fake.prototype);
                }
              } else {
                try {
                  throw Error();
                } catch (x$2) {
                  control = x$2;
                }
                (Fake = fn()) && "function" === typeof Fake.catch && Fake.catch(function() {
                });
              }
            } catch (sample) {
              if (sample && control && "string" === typeof sample.stack)
                return [sample.stack, control.stack];
            }
            return [null, null];
          }
        };
        RunInRootFrame.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
        var namePropDescriptor = Object.getOwnPropertyDescriptor(
          RunInRootFrame.DetermineComponentFrameRoot,
          "name"
        );
        namePropDescriptor && namePropDescriptor.configurable && Object.defineProperty(
          RunInRootFrame.DetermineComponentFrameRoot,
          "name",
          { value: "DetermineComponentFrameRoot" }
        );
        var _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(), sampleStack = _RunInRootFrame$Deter[0], controlStack = _RunInRootFrame$Deter[1];
        if (sampleStack && controlStack) {
          var sampleLines = sampleStack.split("\n"), controlLines = controlStack.split("\n");
          for (namePropDescriptor = RunInRootFrame = 0; RunInRootFrame < sampleLines.length && !sampleLines[RunInRootFrame].includes("DetermineComponentFrameRoot"); )
            RunInRootFrame++;
          for (; namePropDescriptor < controlLines.length && !controlLines[namePropDescriptor].includes(
            "DetermineComponentFrameRoot"
          ); )
            namePropDescriptor++;
          if (RunInRootFrame === sampleLines.length || namePropDescriptor === controlLines.length)
            for (RunInRootFrame = sampleLines.length - 1, namePropDescriptor = controlLines.length - 1; 1 <= RunInRootFrame && 0 <= namePropDescriptor && sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]; )
              namePropDescriptor--;
          for (; 1 <= RunInRootFrame && 0 <= namePropDescriptor; RunInRootFrame--, namePropDescriptor--)
            if (sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
              if (1 !== RunInRootFrame || 1 !== namePropDescriptor) {
                do
                  if (RunInRootFrame--, namePropDescriptor--, 0 > namePropDescriptor || sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
                    var frame = "\n" + sampleLines[RunInRootFrame].replace(" at new ", " at ");
                    fn.displayName && frame.includes("<anonymous>") && (frame = frame.replace("<anonymous>", fn.displayName));
                    return frame;
                  }
                while (1 <= RunInRootFrame && 0 <= namePropDescriptor);
              }
              break;
            }
        }
      } finally {
        reentry = false, Error.prepareStackTrace = previousPrepareStackTrace;
      }
      return (previousPrepareStackTrace = fn ? fn.displayName || fn.name : "") ? describeBuiltInComponentFrame(previousPrepareStackTrace) : "";
    }
    function describeFiber(fiber, childFiber) {
      switch (fiber.tag) {
        case 26:
        case 27:
        case 5:
          return describeBuiltInComponentFrame(fiber.type);
        case 16:
          return describeBuiltInComponentFrame("Lazy");
        case 13:
          return fiber.child !== childFiber && null !== childFiber ? describeBuiltInComponentFrame("Suspense Fallback") : describeBuiltInComponentFrame("Suspense");
        case 19:
          return describeBuiltInComponentFrame("SuspenseList");
        case 0:
        case 15:
          return describeNativeComponentFrame(fiber.type, false);
        case 11:
          return describeNativeComponentFrame(fiber.type.render, false);
        case 1:
          return describeNativeComponentFrame(fiber.type, true);
        case 31:
          return describeBuiltInComponentFrame("Activity");
        default:
          return "";
      }
    }
    function getStackByFiberInDevAndProd(workInProgress2) {
      try {
        var info = "", previous = null;
        do
          info += describeFiber(workInProgress2, previous), previous = workInProgress2, workInProgress2 = workInProgress2.return;
        while (workInProgress2);
        return info;
      } catch (x2) {
        return "\nError generating stack: " + x2.message + "\n" + x2.stack;
      }
    }
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var scheduleCallback$3 = Scheduler.unstable_scheduleCallback;
    var cancelCallback$1 = Scheduler.unstable_cancelCallback;
    var shouldYield = Scheduler.unstable_shouldYield;
    var requestPaint = Scheduler.unstable_requestPaint;
    var now = Scheduler.unstable_now;
    var getCurrentPriorityLevel = Scheduler.unstable_getCurrentPriorityLevel;
    var ImmediatePriority = Scheduler.unstable_ImmediatePriority;
    var UserBlockingPriority = Scheduler.unstable_UserBlockingPriority;
    var NormalPriority$1 = Scheduler.unstable_NormalPriority;
    var LowPriority = Scheduler.unstable_LowPriority;
    var IdlePriority = Scheduler.unstable_IdlePriority;
    var log$1 = Scheduler.log;
    var unstable_setDisableYieldValue = Scheduler.unstable_setDisableYieldValue;
    var rendererID = null;
    var injectedHook = null;
    function setIsStrictModeForDevtools(newIsStrictMode) {
      "function" === typeof log$1 && unstable_setDisableYieldValue(newIsStrictMode);
      if (injectedHook && "function" === typeof injectedHook.setStrictMode)
        try {
          injectedHook.setStrictMode(rendererID, newIsStrictMode);
        } catch (err) {
        }
    }
    var clz32 = Math.clz32 ? Math.clz32 : clz32Fallback;
    var log = Math.log;
    var LN2 = Math.LN2;
    function clz32Fallback(x2) {
      x2 >>>= 0;
      return 0 === x2 ? 32 : 31 - (log(x2) / LN2 | 0) | 0;
    }
    var nextTransitionUpdateLane = 256;
    var nextTransitionDeferredLane = 262144;
    var nextRetryLane = 4194304;
    function getHighestPriorityLanes(lanes) {
      var pendingSyncLanes = lanes & 42;
      if (0 !== pendingSyncLanes) return pendingSyncLanes;
      switch (lanes & -lanes) {
        case 1:
          return 1;
        case 2:
          return 2;
        case 4:
          return 4;
        case 8:
          return 8;
        case 16:
          return 16;
        case 32:
          return 32;
        case 64:
          return 64;
        case 128:
          return 128;
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
          return lanes & 261888;
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return lanes & 3932160;
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          return lanes & 62914560;
        case 67108864:
          return 67108864;
        case 134217728:
          return 134217728;
        case 268435456:
          return 268435456;
        case 536870912:
          return 536870912;
        case 1073741824:
          return 0;
        default:
          return lanes;
      }
    }
    function getNextLanes(root2, wipLanes, rootHasPendingCommit) {
      var pendingLanes = root2.pendingLanes;
      if (0 === pendingLanes) return 0;
      var nextLanes = 0, suspendedLanes = root2.suspendedLanes, pingedLanes = root2.pingedLanes;
      root2 = root2.warmLanes;
      var nonIdlePendingLanes = pendingLanes & 134217727;
      0 !== nonIdlePendingLanes ? (pendingLanes = nonIdlePendingLanes & ~suspendedLanes, 0 !== pendingLanes ? nextLanes = getHighestPriorityLanes(pendingLanes) : (pingedLanes &= nonIdlePendingLanes, 0 !== pingedLanes ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = nonIdlePendingLanes & ~root2, 0 !== rootHasPendingCommit && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))))) : (nonIdlePendingLanes = pendingLanes & ~suspendedLanes, 0 !== nonIdlePendingLanes ? nextLanes = getHighestPriorityLanes(nonIdlePendingLanes) : 0 !== pingedLanes ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = pendingLanes & ~root2, 0 !== rootHasPendingCommit && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))));
      return 0 === nextLanes ? 0 : 0 !== wipLanes && wipLanes !== nextLanes && 0 === (wipLanes & suspendedLanes) && (suspendedLanes = nextLanes & -nextLanes, rootHasPendingCommit = wipLanes & -wipLanes, suspendedLanes >= rootHasPendingCommit || 32 === suspendedLanes && 0 !== (rootHasPendingCommit & 4194048)) ? wipLanes : nextLanes;
    }
    function checkIfRootIsPrerendering(root2, renderLanes2) {
      return 0 === (root2.pendingLanes & ~(root2.suspendedLanes & ~root2.pingedLanes) & renderLanes2);
    }
    function computeExpirationTime(lane, currentTime) {
      switch (lane) {
        case 1:
        case 2:
        case 4:
        case 8:
        case 64:
          return currentTime + 250;
        case 16:
        case 32:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return currentTime + 5e3;
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          return -1;
        case 67108864:
        case 134217728:
        case 268435456:
        case 536870912:
        case 1073741824:
          return -1;
        default:
          return -1;
      }
    }
    function claimNextRetryLane() {
      var lane = nextRetryLane;
      nextRetryLane <<= 1;
      0 === (nextRetryLane & 62914560) && (nextRetryLane = 4194304);
      return lane;
    }
    function createLaneMap(initial) {
      for (var laneMap = [], i = 0; 31 > i; i++) laneMap.push(initial);
      return laneMap;
    }
    function markRootUpdated$1(root2, updateLane) {
      root2.pendingLanes |= updateLane;
      268435456 !== updateLane && (root2.suspendedLanes = 0, root2.pingedLanes = 0, root2.warmLanes = 0);
    }
    function markRootFinished(root2, finishedLanes, remainingLanes, spawnedLane, updatedLanes, suspendedRetryLanes) {
      var previouslyPendingLanes = root2.pendingLanes;
      root2.pendingLanes = remainingLanes;
      root2.suspendedLanes = 0;
      root2.pingedLanes = 0;
      root2.warmLanes = 0;
      root2.expiredLanes &= remainingLanes;
      root2.entangledLanes &= remainingLanes;
      root2.errorRecoveryDisabledLanes &= remainingLanes;
      root2.shellSuspendCounter = 0;
      var entanglements = root2.entanglements, expirationTimes = root2.expirationTimes, hiddenUpdates = root2.hiddenUpdates;
      for (remainingLanes = previouslyPendingLanes & ~remainingLanes; 0 < remainingLanes; ) {
        var index$7 = 31 - clz32(remainingLanes), lane = 1 << index$7;
        entanglements[index$7] = 0;
        expirationTimes[index$7] = -1;
        var hiddenUpdatesForLane = hiddenUpdates[index$7];
        if (null !== hiddenUpdatesForLane)
          for (hiddenUpdates[index$7] = null, index$7 = 0; index$7 < hiddenUpdatesForLane.length; index$7++) {
            var update2 = hiddenUpdatesForLane[index$7];
            null !== update2 && (update2.lane &= -536870913);
          }
        remainingLanes &= ~lane;
      }
      0 !== spawnedLane && markSpawnedDeferredLane(root2, spawnedLane, 0);
      0 !== suspendedRetryLanes && 0 === updatedLanes && 0 !== root2.tag && (root2.suspendedLanes |= suspendedRetryLanes & ~(previouslyPendingLanes & ~finishedLanes));
    }
    function markSpawnedDeferredLane(root2, spawnedLane, entangledLanes) {
      root2.pendingLanes |= spawnedLane;
      root2.suspendedLanes &= ~spawnedLane;
      var spawnedLaneIndex = 31 - clz32(spawnedLane);
      root2.entangledLanes |= spawnedLane;
      root2.entanglements[spawnedLaneIndex] = root2.entanglements[spawnedLaneIndex] | 1073741824 | entangledLanes & 261930;
    }
    function markRootEntangled(root2, entangledLanes) {
      var rootEntangledLanes = root2.entangledLanes |= entangledLanes;
      for (root2 = root2.entanglements; rootEntangledLanes; ) {
        var index$8 = 31 - clz32(rootEntangledLanes), lane = 1 << index$8;
        lane & entangledLanes | root2[index$8] & entangledLanes && (root2[index$8] |= entangledLanes);
        rootEntangledLanes &= ~lane;
      }
    }
    function getBumpedLaneForHydration(root2, renderLanes2) {
      var renderLane = renderLanes2 & -renderLanes2;
      renderLane = 0 !== (renderLane & 42) ? 1 : getBumpedLaneForHydrationByLane(renderLane);
      return 0 !== (renderLane & (root2.suspendedLanes | renderLanes2)) ? 0 : renderLane;
    }
    function getBumpedLaneForHydrationByLane(lane) {
      switch (lane) {
        case 2:
          lane = 1;
          break;
        case 8:
          lane = 4;
          break;
        case 32:
          lane = 16;
          break;
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          lane = 128;
          break;
        case 268435456:
          lane = 134217728;
          break;
        default:
          lane = 0;
      }
      return lane;
    }
    function lanesToEventPriority(lanes) {
      lanes &= -lanes;
      return 2 < lanes ? 8 < lanes ? 0 !== (lanes & 134217727) ? 32 : 268435456 : 8 : 2;
    }
    function resolveUpdatePriority() {
      var updatePriority = ReactDOMSharedInternals.p;
      if (0 !== updatePriority) return updatePriority;
      updatePriority = window.event;
      return void 0 === updatePriority ? 32 : getEventPriority(updatePriority.type);
    }
    function runWithPriority(priority, fn) {
      var previousPriority = ReactDOMSharedInternals.p;
      try {
        return ReactDOMSharedInternals.p = priority, fn();
      } finally {
        ReactDOMSharedInternals.p = previousPriority;
      }
    }
    var randomKey = Math.random().toString(36).slice(2);
    var internalInstanceKey = "__reactFiber$" + randomKey;
    var internalPropsKey = "__reactProps$" + randomKey;
    var internalContainerInstanceKey = "__reactContainer$" + randomKey;
    var internalEventHandlersKey = "__reactEvents$" + randomKey;
    var internalEventHandlerListenersKey = "__reactListeners$" + randomKey;
    var internalEventHandlesSetKey = "__reactHandles$" + randomKey;
    var internalRootNodeResourcesKey = "__reactResources$" + randomKey;
    var internalHoistableMarker = "__reactMarker$" + randomKey;
    function detachDeletedInstance(node) {
      delete node[internalInstanceKey];
      delete node[internalPropsKey];
      delete node[internalEventHandlersKey];
      delete node[internalEventHandlerListenersKey];
      delete node[internalEventHandlesSetKey];
    }
    function getClosestInstanceFromNode(targetNode) {
      var targetInst = targetNode[internalInstanceKey];
      if (targetInst) return targetInst;
      for (var parentNode = targetNode.parentNode; parentNode; ) {
        if (targetInst = parentNode[internalContainerInstanceKey] || parentNode[internalInstanceKey]) {
          parentNode = targetInst.alternate;
          if (null !== targetInst.child || null !== parentNode && null !== parentNode.child)
            for (targetNode = getParentHydrationBoundary(targetNode); null !== targetNode; ) {
              if (parentNode = targetNode[internalInstanceKey]) return parentNode;
              targetNode = getParentHydrationBoundary(targetNode);
            }
          return targetInst;
        }
        targetNode = parentNode;
        parentNode = targetNode.parentNode;
      }
      return null;
    }
    function getInstanceFromNode(node) {
      if (node = node[internalInstanceKey] || node[internalContainerInstanceKey]) {
        var tag = node.tag;
        if (5 === tag || 6 === tag || 13 === tag || 31 === tag || 26 === tag || 27 === tag || 3 === tag)
          return node;
      }
      return null;
    }
    function getNodeFromInstance(inst) {
      var tag = inst.tag;
      if (5 === tag || 26 === tag || 27 === tag || 6 === tag) return inst.stateNode;
      throw Error(formatProdErrorMessage(33));
    }
    function getResourcesFromRoot(root2) {
      var resources = root2[internalRootNodeResourcesKey];
      resources || (resources = root2[internalRootNodeResourcesKey] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() });
      return resources;
    }
    function markNodeAsHoistable(node) {
      node[internalHoistableMarker] = true;
    }
    var allNativeEvents = /* @__PURE__ */ new Set();
    var registrationNameDependencies = {};
    function registerTwoPhaseEvent(registrationName, dependencies) {
      registerDirectEvent(registrationName, dependencies);
      registerDirectEvent(registrationName + "Capture", dependencies);
    }
    function registerDirectEvent(registrationName, dependencies) {
      registrationNameDependencies[registrationName] = dependencies;
      for (registrationName = 0; registrationName < dependencies.length; registrationName++)
        allNativeEvents.add(dependencies[registrationName]);
    }
    var VALID_ATTRIBUTE_NAME_REGEX = RegExp(
      "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    );
    var illegalAttributeNameCache = {};
    var validatedAttributeNameCache = {};
    function isAttributeNameSafe(attributeName) {
      if (hasOwnProperty.call(validatedAttributeNameCache, attributeName))
        return true;
      if (hasOwnProperty.call(illegalAttributeNameCache, attributeName)) return false;
      if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName))
        return validatedAttributeNameCache[attributeName] = true;
      illegalAttributeNameCache[attributeName] = true;
      return false;
    }
    function setValueForAttribute(node, name, value) {
      if (isAttributeNameSafe(name))
        if (null === value) node.removeAttribute(name);
        else {
          switch (typeof value) {
            case "undefined":
            case "function":
            case "symbol":
              node.removeAttribute(name);
              return;
            case "boolean":
              var prefix$10 = name.toLowerCase().slice(0, 5);
              if ("data-" !== prefix$10 && "aria-" !== prefix$10) {
                node.removeAttribute(name);
                return;
              }
          }
          node.setAttribute(name, "" + value);
        }
    }
    function setValueForKnownAttribute(node, name, value) {
      if (null === value) node.removeAttribute(name);
      else {
        switch (typeof value) {
          case "undefined":
          case "function":
          case "symbol":
          case "boolean":
            node.removeAttribute(name);
            return;
        }
        node.setAttribute(name, "" + value);
      }
    }
    function setValueForNamespacedAttribute(node, namespace, name, value) {
      if (null === value) node.removeAttribute(name);
      else {
        switch (typeof value) {
          case "undefined":
          case "function":
          case "symbol":
          case "boolean":
            node.removeAttribute(name);
            return;
        }
        node.setAttributeNS(namespace, name, "" + value);
      }
    }
    function getToStringValue(value) {
      switch (typeof value) {
        case "bigint":
        case "boolean":
        case "number":
        case "string":
        case "undefined":
          return value;
        case "object":
          return value;
        default:
          return "";
      }
    }
    function isCheckable(elem) {
      var type = elem.type;
      return (elem = elem.nodeName) && "input" === elem.toLowerCase() && ("checkbox" === type || "radio" === type);
    }
    function trackValueOnNode(node, valueField, currentValue) {
      var descriptor = Object.getOwnPropertyDescriptor(
        node.constructor.prototype,
        valueField
      );
      if (!node.hasOwnProperty(valueField) && "undefined" !== typeof descriptor && "function" === typeof descriptor.get && "function" === typeof descriptor.set) {
        var get = descriptor.get, set = descriptor.set;
        Object.defineProperty(node, valueField, {
          configurable: true,
          get: function() {
            return get.call(this);
          },
          set: function(value) {
            currentValue = "" + value;
            set.call(this, value);
          }
        });
        Object.defineProperty(node, valueField, {
          enumerable: descriptor.enumerable
        });
        return {
          getValue: function() {
            return currentValue;
          },
          setValue: function(value) {
            currentValue = "" + value;
          },
          stopTracking: function() {
            node._valueTracker = null;
            delete node[valueField];
          }
        };
      }
    }
    function track(node) {
      if (!node._valueTracker) {
        var valueField = isCheckable(node) ? "checked" : "value";
        node._valueTracker = trackValueOnNode(
          node,
          valueField,
          "" + node[valueField]
        );
      }
    }
    function updateValueIfChanged(node) {
      if (!node) return false;
      var tracker = node._valueTracker;
      if (!tracker) return true;
      var lastValue = tracker.getValue();
      var value = "";
      node && (value = isCheckable(node) ? node.checked ? "true" : "false" : node.value);
      node = value;
      return node !== lastValue ? (tracker.setValue(node), true) : false;
    }
    function getActiveElement(doc) {
      doc = doc || ("undefined" !== typeof document ? document : void 0);
      if ("undefined" === typeof doc) return null;
      try {
        return doc.activeElement || doc.body;
      } catch (e) {
        return doc.body;
      }
    }
    var escapeSelectorAttributeValueInsideDoubleQuotesRegex = /[\n"\\]/g;
    function escapeSelectorAttributeValueInsideDoubleQuotes(value) {
      return value.replace(
        escapeSelectorAttributeValueInsideDoubleQuotesRegex,
        function(ch) {
          return "\\" + ch.charCodeAt(0).toString(16) + " ";
        }
      );
    }
    function updateInput(element, value, defaultValue, lastDefaultValue, checked, defaultChecked, type, name) {
      element.name = "";
      null != type && "function" !== typeof type && "symbol" !== typeof type && "boolean" !== typeof type ? element.type = type : element.removeAttribute("type");
      if (null != value)
        if ("number" === type) {
          if (0 === value && "" === element.value || element.value != value)
            element.value = "" + getToStringValue(value);
        } else
          element.value !== "" + getToStringValue(value) && (element.value = "" + getToStringValue(value));
      else
        "submit" !== type && "reset" !== type || element.removeAttribute("value");
      null != value ? setDefaultValue(element, type, getToStringValue(value)) : null != defaultValue ? setDefaultValue(element, type, getToStringValue(defaultValue)) : null != lastDefaultValue && element.removeAttribute("value");
      null == checked && null != defaultChecked && (element.defaultChecked = !!defaultChecked);
      null != checked && (element.checked = checked && "function" !== typeof checked && "symbol" !== typeof checked);
      null != name && "function" !== typeof name && "symbol" !== typeof name && "boolean" !== typeof name ? element.name = "" + getToStringValue(name) : element.removeAttribute("name");
    }
    function initInput(element, value, defaultValue, checked, defaultChecked, type, name, isHydrating2) {
      null != type && "function" !== typeof type && "symbol" !== typeof type && "boolean" !== typeof type && (element.type = type);
      if (null != value || null != defaultValue) {
        if (!("submit" !== type && "reset" !== type || void 0 !== value && null !== value)) {
          track(element);
          return;
        }
        defaultValue = null != defaultValue ? "" + getToStringValue(defaultValue) : "";
        value = null != value ? "" + getToStringValue(value) : defaultValue;
        isHydrating2 || value === element.value || (element.value = value);
        element.defaultValue = value;
      }
      checked = null != checked ? checked : defaultChecked;
      checked = "function" !== typeof checked && "symbol" !== typeof checked && !!checked;
      element.checked = isHydrating2 ? element.checked : !!checked;
      element.defaultChecked = !!checked;
      null != name && "function" !== typeof name && "symbol" !== typeof name && "boolean" !== typeof name && (element.name = name);
      track(element);
    }
    function setDefaultValue(node, type, value) {
      "number" === type && getActiveElement(node.ownerDocument) === node || node.defaultValue === "" + value || (node.defaultValue = "" + value);
    }
    function updateOptions(node, multiple, propValue, setDefaultSelected) {
      node = node.options;
      if (multiple) {
        multiple = {};
        for (var i = 0; i < propValue.length; i++)
          multiple["$" + propValue[i]] = true;
        for (propValue = 0; propValue < node.length; propValue++)
          i = multiple.hasOwnProperty("$" + node[propValue].value), node[propValue].selected !== i && (node[propValue].selected = i), i && setDefaultSelected && (node[propValue].defaultSelected = true);
      } else {
        propValue = "" + getToStringValue(propValue);
        multiple = null;
        for (i = 0; i < node.length; i++) {
          if (node[i].value === propValue) {
            node[i].selected = true;
            setDefaultSelected && (node[i].defaultSelected = true);
            return;
          }
          null !== multiple || node[i].disabled || (multiple = node[i]);
        }
        null !== multiple && (multiple.selected = true);
      }
    }
    function updateTextarea(element, value, defaultValue) {
      if (null != value && (value = "" + getToStringValue(value), value !== element.value && (element.value = value), null == defaultValue)) {
        element.defaultValue !== value && (element.defaultValue = value);
        return;
      }
      element.defaultValue = null != defaultValue ? "" + getToStringValue(defaultValue) : "";
    }
    function initTextarea(element, value, defaultValue, children) {
      if (null == value) {
        if (null != children) {
          if (null != defaultValue) throw Error(formatProdErrorMessage(92));
          if (isArrayImpl(children)) {
            if (1 < children.length) throw Error(formatProdErrorMessage(93));
            children = children[0];
          }
          defaultValue = children;
        }
        null == defaultValue && (defaultValue = "");
        value = defaultValue;
      }
      defaultValue = getToStringValue(value);
      element.defaultValue = defaultValue;
      children = element.textContent;
      children === defaultValue && "" !== children && null !== children && (element.value = children);
      track(element);
    }
    function setTextContent(node, text) {
      if (text) {
        var firstChild = node.firstChild;
        if (firstChild && firstChild === node.lastChild && 3 === firstChild.nodeType) {
          firstChild.nodeValue = text;
          return;
        }
      }
      node.textContent = text;
    }
    var unitlessNumbers = new Set(
      "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
        " "
      )
    );
    function setValueForStyle(style2, styleName, value) {
      var isCustomProperty = 0 === styleName.indexOf("--");
      null == value || "boolean" === typeof value || "" === value ? isCustomProperty ? style2.setProperty(styleName, "") : "float" === styleName ? style2.cssFloat = "" : style2[styleName] = "" : isCustomProperty ? style2.setProperty(styleName, value) : "number" !== typeof value || 0 === value || unitlessNumbers.has(styleName) ? "float" === styleName ? style2.cssFloat = value : style2[styleName] = ("" + value).trim() : style2[styleName] = value + "px";
    }
    function setValueForStyles(node, styles, prevStyles) {
      if (null != styles && "object" !== typeof styles)
        throw Error(formatProdErrorMessage(62));
      node = node.style;
      if (null != prevStyles) {
        for (var styleName in prevStyles)
          !prevStyles.hasOwnProperty(styleName) || null != styles && styles.hasOwnProperty(styleName) || (0 === styleName.indexOf("--") ? node.setProperty(styleName, "") : "float" === styleName ? node.cssFloat = "" : node[styleName] = "");
        for (var styleName$16 in styles)
          styleName = styles[styleName$16], styles.hasOwnProperty(styleName$16) && prevStyles[styleName$16] !== styleName && setValueForStyle(node, styleName$16, styleName);
      } else
        for (var styleName$17 in styles)
          styles.hasOwnProperty(styleName$17) && setValueForStyle(node, styleName$17, styles[styleName$17]);
    }
    function isCustomElement(tagName) {
      if (-1 === tagName.indexOf("-")) return false;
      switch (tagName) {
        case "annotation-xml":
        case "color-profile":
        case "font-face":
        case "font-face-src":
        case "font-face-uri":
        case "font-face-format":
        case "font-face-name":
        case "missing-glyph":
          return false;
        default:
          return true;
      }
    }
    var aliases = /* @__PURE__ */ new Map([
      ["acceptCharset", "accept-charset"],
      ["htmlFor", "for"],
      ["httpEquiv", "http-equiv"],
      ["crossOrigin", "crossorigin"],
      ["accentHeight", "accent-height"],
      ["alignmentBaseline", "alignment-baseline"],
      ["arabicForm", "arabic-form"],
      ["baselineShift", "baseline-shift"],
      ["capHeight", "cap-height"],
      ["clipPath", "clip-path"],
      ["clipRule", "clip-rule"],
      ["colorInterpolation", "color-interpolation"],
      ["colorInterpolationFilters", "color-interpolation-filters"],
      ["colorProfile", "color-profile"],
      ["colorRendering", "color-rendering"],
      ["dominantBaseline", "dominant-baseline"],
      ["enableBackground", "enable-background"],
      ["fillOpacity", "fill-opacity"],
      ["fillRule", "fill-rule"],
      ["floodColor", "flood-color"],
      ["floodOpacity", "flood-opacity"],
      ["fontFamily", "font-family"],
      ["fontSize", "font-size"],
      ["fontSizeAdjust", "font-size-adjust"],
      ["fontStretch", "font-stretch"],
      ["fontStyle", "font-style"],
      ["fontVariant", "font-variant"],
      ["fontWeight", "font-weight"],
      ["glyphName", "glyph-name"],
      ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
      ["glyphOrientationVertical", "glyph-orientation-vertical"],
      ["horizAdvX", "horiz-adv-x"],
      ["horizOriginX", "horiz-origin-x"],
      ["imageRendering", "image-rendering"],
      ["letterSpacing", "letter-spacing"],
      ["lightingColor", "lighting-color"],
      ["markerEnd", "marker-end"],
      ["markerMid", "marker-mid"],
      ["markerStart", "marker-start"],
      ["overlinePosition", "overline-position"],
      ["overlineThickness", "overline-thickness"],
      ["paintOrder", "paint-order"],
      ["panose-1", "panose-1"],
      ["pointerEvents", "pointer-events"],
      ["renderingIntent", "rendering-intent"],
      ["shapeRendering", "shape-rendering"],
      ["stopColor", "stop-color"],
      ["stopOpacity", "stop-opacity"],
      ["strikethroughPosition", "strikethrough-position"],
      ["strikethroughThickness", "strikethrough-thickness"],
      ["strokeDasharray", "stroke-dasharray"],
      ["strokeDashoffset", "stroke-dashoffset"],
      ["strokeLinecap", "stroke-linecap"],
      ["strokeLinejoin", "stroke-linejoin"],
      ["strokeMiterlimit", "stroke-miterlimit"],
      ["strokeOpacity", "stroke-opacity"],
      ["strokeWidth", "stroke-width"],
      ["textAnchor", "text-anchor"],
      ["textDecoration", "text-decoration"],
      ["textRendering", "text-rendering"],
      ["transformOrigin", "transform-origin"],
      ["underlinePosition", "underline-position"],
      ["underlineThickness", "underline-thickness"],
      ["unicodeBidi", "unicode-bidi"],
      ["unicodeRange", "unicode-range"],
      ["unitsPerEm", "units-per-em"],
      ["vAlphabetic", "v-alphabetic"],
      ["vHanging", "v-hanging"],
      ["vIdeographic", "v-ideographic"],
      ["vMathematical", "v-mathematical"],
      ["vectorEffect", "vector-effect"],
      ["vertAdvY", "vert-adv-y"],
      ["vertOriginX", "vert-origin-x"],
      ["vertOriginY", "vert-origin-y"],
      ["wordSpacing", "word-spacing"],
      ["writingMode", "writing-mode"],
      ["xmlnsXlink", "xmlns:xlink"],
      ["xHeight", "x-height"]
    ]);
    var isJavaScriptProtocol = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
    function sanitizeURL(url) {
      return isJavaScriptProtocol.test("" + url) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : url;
    }
    function noop$1() {
    }
    var currentReplayingEvent = null;
    function getEventTarget(nativeEvent) {
      nativeEvent = nativeEvent.target || nativeEvent.srcElement || window;
      nativeEvent.correspondingUseElement && (nativeEvent = nativeEvent.correspondingUseElement);
      return 3 === nativeEvent.nodeType ? nativeEvent.parentNode : nativeEvent;
    }
    var restoreTarget = null;
    var restoreQueue = null;
    function restoreStateOfTarget(target) {
      var internalInstance = getInstanceFromNode(target);
      if (internalInstance && (target = internalInstance.stateNode)) {
        var props = target[internalPropsKey] || null;
        a: switch (target = internalInstance.stateNode, internalInstance.type) {
          case "input":
            updateInput(
              target,
              props.value,
              props.defaultValue,
              props.defaultValue,
              props.checked,
              props.defaultChecked,
              props.type,
              props.name
            );
            internalInstance = props.name;
            if ("radio" === props.type && null != internalInstance) {
              for (props = target; props.parentNode; ) props = props.parentNode;
              props = props.querySelectorAll(
                'input[name="' + escapeSelectorAttributeValueInsideDoubleQuotes(
                  "" + internalInstance
                ) + '"][type="radio"]'
              );
              for (internalInstance = 0; internalInstance < props.length; internalInstance++) {
                var otherNode = props[internalInstance];
                if (otherNode !== target && otherNode.form === target.form) {
                  var otherProps = otherNode[internalPropsKey] || null;
                  if (!otherProps) throw Error(formatProdErrorMessage(90));
                  updateInput(
                    otherNode,
                    otherProps.value,
                    otherProps.defaultValue,
                    otherProps.defaultValue,
                    otherProps.checked,
                    otherProps.defaultChecked,
                    otherProps.type,
                    otherProps.name
                  );
                }
              }
              for (internalInstance = 0; internalInstance < props.length; internalInstance++)
                otherNode = props[internalInstance], otherNode.form === target.form && updateValueIfChanged(otherNode);
            }
            break a;
          case "textarea":
            updateTextarea(target, props.value, props.defaultValue);
            break a;
          case "select":
            internalInstance = props.value, null != internalInstance && updateOptions(target, !!props.multiple, internalInstance, false);
        }
      }
    }
    var isInsideEventHandler = false;
    function batchedUpdates$1(fn, a, b2) {
      if (isInsideEventHandler) return fn(a, b2);
      isInsideEventHandler = true;
      try {
        var JSCompiler_inline_result = fn(a);
        return JSCompiler_inline_result;
      } finally {
        if (isInsideEventHandler = false, null !== restoreTarget || null !== restoreQueue) {
          if (flushSyncWork$1(), restoreTarget && (a = restoreTarget, fn = restoreQueue, restoreQueue = restoreTarget = null, restoreStateOfTarget(a), fn))
            for (a = 0; a < fn.length; a++) restoreStateOfTarget(fn[a]);
        }
      }
    }
    function getListener(inst, registrationName) {
      var stateNode = inst.stateNode;
      if (null === stateNode) return null;
      var props = stateNode[internalPropsKey] || null;
      if (null === props) return null;
      stateNode = props[registrationName];
      a: switch (registrationName) {
        case "onClick":
        case "onClickCapture":
        case "onDoubleClick":
        case "onDoubleClickCapture":
        case "onMouseDown":
        case "onMouseDownCapture":
        case "onMouseMove":
        case "onMouseMoveCapture":
        case "onMouseUp":
        case "onMouseUpCapture":
        case "onMouseEnter":
          (props = !props.disabled) || (inst = inst.type, props = !("button" === inst || "input" === inst || "select" === inst || "textarea" === inst));
          inst = !props;
          break a;
        default:
          inst = false;
      }
      if (inst) return null;
      if (stateNode && "function" !== typeof stateNode)
        throw Error(
          formatProdErrorMessage(231, registrationName, typeof stateNode)
        );
      return stateNode;
    }
    var canUseDOM = !("undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement);
    var passiveBrowserEventsSupported = false;
    if (canUseDOM)
      try {
        options = {};
        Object.defineProperty(options, "passive", {
          get: function() {
            passiveBrowserEventsSupported = true;
          }
        });
        window.addEventListener("test", options, options);
        window.removeEventListener("test", options, options);
      } catch (e) {
        passiveBrowserEventsSupported = false;
      }
    var options;
    var root = null;
    var startText = null;
    var fallbackText = null;
    function getData() {
      if (fallbackText) return fallbackText;
      var start, startValue = startText, startLength = startValue.length, end, endValue = "value" in root ? root.value : root.textContent, endLength = endValue.length;
      for (start = 0; start < startLength && startValue[start] === endValue[start]; start++) ;
      var minEnd = startLength - start;
      for (end = 1; end <= minEnd && startValue[startLength - end] === endValue[endLength - end]; end++) ;
      return fallbackText = endValue.slice(start, 1 < end ? 1 - end : void 0);
    }
    function getEventCharCode(nativeEvent) {
      var keyCode = nativeEvent.keyCode;
      "charCode" in nativeEvent ? (nativeEvent = nativeEvent.charCode, 0 === nativeEvent && 13 === keyCode && (nativeEvent = 13)) : nativeEvent = keyCode;
      10 === nativeEvent && (nativeEvent = 13);
      return 32 <= nativeEvent || 13 === nativeEvent ? nativeEvent : 0;
    }
    function functionThatReturnsTrue() {
      return true;
    }
    function functionThatReturnsFalse() {
      return false;
    }
    function createSyntheticEvent(Interface) {
      function SyntheticBaseEvent(reactName, reactEventType, targetInst, nativeEvent, nativeEventTarget) {
        this._reactName = reactName;
        this._targetInst = targetInst;
        this.type = reactEventType;
        this.nativeEvent = nativeEvent;
        this.target = nativeEventTarget;
        this.currentTarget = null;
        for (var propName in Interface)
          Interface.hasOwnProperty(propName) && (reactName = Interface[propName], this[propName] = reactName ? reactName(nativeEvent) : nativeEvent[propName]);
        this.isDefaultPrevented = (null != nativeEvent.defaultPrevented ? nativeEvent.defaultPrevented : false === nativeEvent.returnValue) ? functionThatReturnsTrue : functionThatReturnsFalse;
        this.isPropagationStopped = functionThatReturnsFalse;
        return this;
      }
      assign(SyntheticBaseEvent.prototype, {
        preventDefault: function() {
          this.defaultPrevented = true;
          var event = this.nativeEvent;
          event && (event.preventDefault ? event.preventDefault() : "unknown" !== typeof event.returnValue && (event.returnValue = false), this.isDefaultPrevented = functionThatReturnsTrue);
        },
        stopPropagation: function() {
          var event = this.nativeEvent;
          event && (event.stopPropagation ? event.stopPropagation() : "unknown" !== typeof event.cancelBubble && (event.cancelBubble = true), this.isPropagationStopped = functionThatReturnsTrue);
        },
        persist: function() {
        },
        isPersistent: functionThatReturnsTrue
      });
      return SyntheticBaseEvent;
    }
    var EventInterface = {
      eventPhase: 0,
      bubbles: 0,
      cancelable: 0,
      timeStamp: function(event) {
        return event.timeStamp || Date.now();
      },
      defaultPrevented: 0,
      isTrusted: 0
    };
    var SyntheticEvent = createSyntheticEvent(EventInterface);
    var UIEventInterface = assign({}, EventInterface, { view: 0, detail: 0 });
    var SyntheticUIEvent = createSyntheticEvent(UIEventInterface);
    var lastMovementX;
    var lastMovementY;
    var lastMouseEvent;
    var MouseEventInterface = assign({}, UIEventInterface, {
      screenX: 0,
      screenY: 0,
      clientX: 0,
      clientY: 0,
      pageX: 0,
      pageY: 0,
      ctrlKey: 0,
      shiftKey: 0,
      altKey: 0,
      metaKey: 0,
      getModifierState: getEventModifierState,
      button: 0,
      buttons: 0,
      relatedTarget: function(event) {
        return void 0 === event.relatedTarget ? event.fromElement === event.srcElement ? event.toElement : event.fromElement : event.relatedTarget;
      },
      movementX: function(event) {
        if ("movementX" in event) return event.movementX;
        event !== lastMouseEvent && (lastMouseEvent && "mousemove" === event.type ? (lastMovementX = event.screenX - lastMouseEvent.screenX, lastMovementY = event.screenY - lastMouseEvent.screenY) : lastMovementY = lastMovementX = 0, lastMouseEvent = event);
        return lastMovementX;
      },
      movementY: function(event) {
        return "movementY" in event ? event.movementY : lastMovementY;
      }
    });
    var SyntheticMouseEvent = createSyntheticEvent(MouseEventInterface);
    var DragEventInterface = assign({}, MouseEventInterface, { dataTransfer: 0 });
    var SyntheticDragEvent = createSyntheticEvent(DragEventInterface);
    var FocusEventInterface = assign({}, UIEventInterface, { relatedTarget: 0 });
    var SyntheticFocusEvent = createSyntheticEvent(FocusEventInterface);
    var AnimationEventInterface = assign({}, EventInterface, {
      animationName: 0,
      elapsedTime: 0,
      pseudoElement: 0
    });
    var SyntheticAnimationEvent = createSyntheticEvent(AnimationEventInterface);
    var ClipboardEventInterface = assign({}, EventInterface, {
      clipboardData: function(event) {
        return "clipboardData" in event ? event.clipboardData : window.clipboardData;
      }
    });
    var SyntheticClipboardEvent = createSyntheticEvent(ClipboardEventInterface);
    var CompositionEventInterface = assign({}, EventInterface, { data: 0 });
    var SyntheticCompositionEvent = createSyntheticEvent(CompositionEventInterface);
    var normalizeKey = {
      Esc: "Escape",
      Spacebar: " ",
      Left: "ArrowLeft",
      Up: "ArrowUp",
      Right: "ArrowRight",
      Down: "ArrowDown",
      Del: "Delete",
      Win: "OS",
      Menu: "ContextMenu",
      Apps: "ContextMenu",
      Scroll: "ScrollLock",
      MozPrintableKey: "Unidentified"
    };
    var translateToKey = {
      8: "Backspace",
      9: "Tab",
      12: "Clear",
      13: "Enter",
      16: "Shift",
      17: "Control",
      18: "Alt",
      19: "Pause",
      20: "CapsLock",
      27: "Escape",
      32: " ",
      33: "PageUp",
      34: "PageDown",
      35: "End",
      36: "Home",
      37: "ArrowLeft",
      38: "ArrowUp",
      39: "ArrowRight",
      40: "ArrowDown",
      45: "Insert",
      46: "Delete",
      112: "F1",
      113: "F2",
      114: "F3",
      115: "F4",
      116: "F5",
      117: "F6",
      118: "F7",
      119: "F8",
      120: "F9",
      121: "F10",
      122: "F11",
      123: "F12",
      144: "NumLock",
      145: "ScrollLock",
      224: "Meta"
    };
    var modifierKeyToProp = {
      Alt: "altKey",
      Control: "ctrlKey",
      Meta: "metaKey",
      Shift: "shiftKey"
    };
    function modifierStateGetter(keyArg) {
      var nativeEvent = this.nativeEvent;
      return nativeEvent.getModifierState ? nativeEvent.getModifierState(keyArg) : (keyArg = modifierKeyToProp[keyArg]) ? !!nativeEvent[keyArg] : false;
    }
    function getEventModifierState() {
      return modifierStateGetter;
    }
    var KeyboardEventInterface = assign({}, UIEventInterface, {
      key: function(nativeEvent) {
        if (nativeEvent.key) {
          var key = normalizeKey[nativeEvent.key] || nativeEvent.key;
          if ("Unidentified" !== key) return key;
        }
        return "keypress" === nativeEvent.type ? (nativeEvent = getEventCharCode(nativeEvent), 13 === nativeEvent ? "Enter" : String.fromCharCode(nativeEvent)) : "keydown" === nativeEvent.type || "keyup" === nativeEvent.type ? translateToKey[nativeEvent.keyCode] || "Unidentified" : "";
      },
      code: 0,
      location: 0,
      ctrlKey: 0,
      shiftKey: 0,
      altKey: 0,
      metaKey: 0,
      repeat: 0,
      locale: 0,
      getModifierState: getEventModifierState,
      charCode: function(event) {
        return "keypress" === event.type ? getEventCharCode(event) : 0;
      },
      keyCode: function(event) {
        return "keydown" === event.type || "keyup" === event.type ? event.keyCode : 0;
      },
      which: function(event) {
        return "keypress" === event.type ? getEventCharCode(event) : "keydown" === event.type || "keyup" === event.type ? event.keyCode : 0;
      }
    });
    var SyntheticKeyboardEvent = createSyntheticEvent(KeyboardEventInterface);
    var PointerEventInterface = assign({}, MouseEventInterface, {
      pointerId: 0,
      width: 0,
      height: 0,
      pressure: 0,
      tangentialPressure: 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      pointerType: 0,
      isPrimary: 0
    });
    var SyntheticPointerEvent = createSyntheticEvent(PointerEventInterface);
    var TouchEventInterface = assign({}, UIEventInterface, {
      touches: 0,
      targetTouches: 0,
      changedTouches: 0,
      altKey: 0,
      metaKey: 0,
      ctrlKey: 0,
      shiftKey: 0,
      getModifierState: getEventModifierState
    });
    var SyntheticTouchEvent = createSyntheticEvent(TouchEventInterface);
    var TransitionEventInterface = assign({}, EventInterface, {
      propertyName: 0,
      elapsedTime: 0,
      pseudoElement: 0
    });
    var SyntheticTransitionEvent = createSyntheticEvent(TransitionEventInterface);
    var WheelEventInterface = assign({}, MouseEventInterface, {
      deltaX: function(event) {
        return "deltaX" in event ? event.deltaX : "wheelDeltaX" in event ? -event.wheelDeltaX : 0;
      },
      deltaY: function(event) {
        return "deltaY" in event ? event.deltaY : "wheelDeltaY" in event ? -event.wheelDeltaY : "wheelDelta" in event ? -event.wheelDelta : 0;
      },
      deltaZ: 0,
      deltaMode: 0
    });
    var SyntheticWheelEvent = createSyntheticEvent(WheelEventInterface);
    var ToggleEventInterface = assign({}, EventInterface, {
      newState: 0,
      oldState: 0
    });
    var SyntheticToggleEvent = createSyntheticEvent(ToggleEventInterface);
    var END_KEYCODES = [9, 13, 27, 32];
    var canUseCompositionEvent = canUseDOM && "CompositionEvent" in window;
    var documentMode = null;
    canUseDOM && "documentMode" in document && (documentMode = document.documentMode);
    var canUseTextInputEvent = canUseDOM && "TextEvent" in window && !documentMode;
    var useFallbackCompositionData = canUseDOM && (!canUseCompositionEvent || documentMode && 8 < documentMode && 11 >= documentMode);
    var SPACEBAR_CHAR = String.fromCharCode(32);
    var hasSpaceKeypress = false;
    function isFallbackCompositionEnd(domEventName, nativeEvent) {
      switch (domEventName) {
        case "keyup":
          return -1 !== END_KEYCODES.indexOf(nativeEvent.keyCode);
        case "keydown":
          return 229 !== nativeEvent.keyCode;
        case "keypress":
        case "mousedown":
        case "focusout":
          return true;
        default:
          return false;
      }
    }
    function getDataFromCustomEvent(nativeEvent) {
      nativeEvent = nativeEvent.detail;
      return "object" === typeof nativeEvent && "data" in nativeEvent ? nativeEvent.data : null;
    }
    var isComposing = false;
    function getNativeBeforeInputChars(domEventName, nativeEvent) {
      switch (domEventName) {
        case "compositionend":
          return getDataFromCustomEvent(nativeEvent);
        case "keypress":
          if (32 !== nativeEvent.which) return null;
          hasSpaceKeypress = true;
          return SPACEBAR_CHAR;
        case "textInput":
          return domEventName = nativeEvent.data, domEventName === SPACEBAR_CHAR && hasSpaceKeypress ? null : domEventName;
        default:
          return null;
      }
    }
    function getFallbackBeforeInputChars(domEventName, nativeEvent) {
      if (isComposing)
        return "compositionend" === domEventName || !canUseCompositionEvent && isFallbackCompositionEnd(domEventName, nativeEvent) ? (domEventName = getData(), fallbackText = startText = root = null, isComposing = false, domEventName) : null;
      switch (domEventName) {
        case "paste":
          return null;
        case "keypress":
          if (!(nativeEvent.ctrlKey || nativeEvent.altKey || nativeEvent.metaKey) || nativeEvent.ctrlKey && nativeEvent.altKey) {
            if (nativeEvent.char && 1 < nativeEvent.char.length)
              return nativeEvent.char;
            if (nativeEvent.which) return String.fromCharCode(nativeEvent.which);
          }
          return null;
        case "compositionend":
          return useFallbackCompositionData && "ko" !== nativeEvent.locale ? null : nativeEvent.data;
        default:
          return null;
      }
    }
    var supportedInputTypes = {
      color: true,
      date: true,
      datetime: true,
      "datetime-local": true,
      email: true,
      month: true,
      number: true,
      password: true,
      range: true,
      search: true,
      tel: true,
      text: true,
      time: true,
      url: true,
      week: true
    };
    function isTextInputElement(elem) {
      var nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase();
      return "input" === nodeName ? !!supportedInputTypes[elem.type] : "textarea" === nodeName ? true : false;
    }
    function createAndAccumulateChangeEvent(dispatchQueue, inst, nativeEvent, target) {
      restoreTarget ? restoreQueue ? restoreQueue.push(target) : restoreQueue = [target] : restoreTarget = target;
      inst = accumulateTwoPhaseListeners(inst, "onChange");
      0 < inst.length && (nativeEvent = new SyntheticEvent(
        "onChange",
        "change",
        null,
        nativeEvent,
        target
      ), dispatchQueue.push({ event: nativeEvent, listeners: inst }));
    }
    var activeElement$1 = null;
    var activeElementInst$1 = null;
    function runEventInBatch(dispatchQueue) {
      processDispatchQueue(dispatchQueue, 0);
    }
    function getInstIfValueChanged(targetInst) {
      var targetNode = getNodeFromInstance(targetInst);
      if (updateValueIfChanged(targetNode)) return targetInst;
    }
    function getTargetInstForChangeEvent(domEventName, targetInst) {
      if ("change" === domEventName) return targetInst;
    }
    var isInputEventSupported = false;
    if (canUseDOM) {
      if (canUseDOM) {
        isSupported$jscomp$inline_427 = "oninput" in document;
        if (!isSupported$jscomp$inline_427) {
          element$jscomp$inline_428 = document.createElement("div");
          element$jscomp$inline_428.setAttribute("oninput", "return;");
          isSupported$jscomp$inline_427 = "function" === typeof element$jscomp$inline_428.oninput;
        }
        JSCompiler_inline_result$jscomp$286 = isSupported$jscomp$inline_427;
      } else JSCompiler_inline_result$jscomp$286 = false;
      isInputEventSupported = JSCompiler_inline_result$jscomp$286 && (!document.documentMode || 9 < document.documentMode);
    }
    var JSCompiler_inline_result$jscomp$286;
    var isSupported$jscomp$inline_427;
    var element$jscomp$inline_428;
    function stopWatchingForValueChange() {
      activeElement$1 && (activeElement$1.detachEvent("onpropertychange", handlePropertyChange), activeElementInst$1 = activeElement$1 = null);
    }
    function handlePropertyChange(nativeEvent) {
      if ("value" === nativeEvent.propertyName && getInstIfValueChanged(activeElementInst$1)) {
        var dispatchQueue = [];
        createAndAccumulateChangeEvent(
          dispatchQueue,
          activeElementInst$1,
          nativeEvent,
          getEventTarget(nativeEvent)
        );
        batchedUpdates$1(runEventInBatch, dispatchQueue);
      }
    }
    function handleEventsForInputEventPolyfill(domEventName, target, targetInst) {
      "focusin" === domEventName ? (stopWatchingForValueChange(), activeElement$1 = target, activeElementInst$1 = targetInst, activeElement$1.attachEvent("onpropertychange", handlePropertyChange)) : "focusout" === domEventName && stopWatchingForValueChange();
    }
    function getTargetInstForInputEventPolyfill(domEventName) {
      if ("selectionchange" === domEventName || "keyup" === domEventName || "keydown" === domEventName)
        return getInstIfValueChanged(activeElementInst$1);
    }
    function getTargetInstForClickEvent(domEventName, targetInst) {
      if ("click" === domEventName) return getInstIfValueChanged(targetInst);
    }
    function getTargetInstForInputOrChangeEvent(domEventName, targetInst) {
      if ("input" === domEventName || "change" === domEventName)
        return getInstIfValueChanged(targetInst);
    }
    function is(x2, y2) {
      return x2 === y2 && (0 !== x2 || 1 / x2 === 1 / y2) || x2 !== x2 && y2 !== y2;
    }
    var objectIs = "function" === typeof Object.is ? Object.is : is;
    function shallowEqual(objA, objB) {
      if (objectIs(objA, objB)) return true;
      if ("object" !== typeof objA || null === objA || "object" !== typeof objB || null === objB)
        return false;
      var keysA = Object.keys(objA), keysB = Object.keys(objB);
      if (keysA.length !== keysB.length) return false;
      for (keysB = 0; keysB < keysA.length; keysB++) {
        var currentKey = keysA[keysB];
        if (!hasOwnProperty.call(objB, currentKey) || !objectIs(objA[currentKey], objB[currentKey]))
          return false;
      }
      return true;
    }
    function getLeafNode(node) {
      for (; node && node.firstChild; ) node = node.firstChild;
      return node;
    }
    function getNodeForCharacterOffset(root2, offset) {
      var node = getLeafNode(root2);
      root2 = 0;
      for (var nodeEnd; node; ) {
        if (3 === node.nodeType) {
          nodeEnd = root2 + node.textContent.length;
          if (root2 <= offset && nodeEnd >= offset)
            return { node, offset: offset - root2 };
          root2 = nodeEnd;
        }
        a: {
          for (; node; ) {
            if (node.nextSibling) {
              node = node.nextSibling;
              break a;
            }
            node = node.parentNode;
          }
          node = void 0;
        }
        node = getLeafNode(node);
      }
    }
    function containsNode(outerNode, innerNode) {
      return outerNode && innerNode ? outerNode === innerNode ? true : outerNode && 3 === outerNode.nodeType ? false : innerNode && 3 === innerNode.nodeType ? containsNode(outerNode, innerNode.parentNode) : "contains" in outerNode ? outerNode.contains(innerNode) : outerNode.compareDocumentPosition ? !!(outerNode.compareDocumentPosition(innerNode) & 16) : false : false;
    }
    function getActiveElementDeep(containerInfo) {
      containerInfo = null != containerInfo && null != containerInfo.ownerDocument && null != containerInfo.ownerDocument.defaultView ? containerInfo.ownerDocument.defaultView : window;
      for (var element = getActiveElement(containerInfo.document); element instanceof containerInfo.HTMLIFrameElement; ) {
        try {
          var JSCompiler_inline_result = "string" === typeof element.contentWindow.location.href;
        } catch (err) {
          JSCompiler_inline_result = false;
        }
        if (JSCompiler_inline_result) containerInfo = element.contentWindow;
        else break;
        element = getActiveElement(containerInfo.document);
      }
      return element;
    }
    function hasSelectionCapabilities(elem) {
      var nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase();
      return nodeName && ("input" === nodeName && ("text" === elem.type || "search" === elem.type || "tel" === elem.type || "url" === elem.type || "password" === elem.type) || "textarea" === nodeName || "true" === elem.contentEditable);
    }
    var skipSelectionChangeEvent = canUseDOM && "documentMode" in document && 11 >= document.documentMode;
    var activeElement = null;
    var activeElementInst = null;
    var lastSelection = null;
    var mouseDown = false;
    function constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget) {
      var doc = nativeEventTarget.window === nativeEventTarget ? nativeEventTarget.document : 9 === nativeEventTarget.nodeType ? nativeEventTarget : nativeEventTarget.ownerDocument;
      mouseDown || null == activeElement || activeElement !== getActiveElement(doc) || (doc = activeElement, "selectionStart" in doc && hasSelectionCapabilities(doc) ? doc = { start: doc.selectionStart, end: doc.selectionEnd } : (doc = (doc.ownerDocument && doc.ownerDocument.defaultView || window).getSelection(), doc = {
        anchorNode: doc.anchorNode,
        anchorOffset: doc.anchorOffset,
        focusNode: doc.focusNode,
        focusOffset: doc.focusOffset
      }), lastSelection && shallowEqual(lastSelection, doc) || (lastSelection = doc, doc = accumulateTwoPhaseListeners(activeElementInst, "onSelect"), 0 < doc.length && (nativeEvent = new SyntheticEvent(
        "onSelect",
        "select",
        null,
        nativeEvent,
        nativeEventTarget
      ), dispatchQueue.push({ event: nativeEvent, listeners: doc }), nativeEvent.target = activeElement)));
    }
    function makePrefixMap(styleProp, eventName) {
      var prefixes = {};
      prefixes[styleProp.toLowerCase()] = eventName.toLowerCase();
      prefixes["Webkit" + styleProp] = "webkit" + eventName;
      prefixes["Moz" + styleProp] = "moz" + eventName;
      return prefixes;
    }
    var vendorPrefixes = {
      animationend: makePrefixMap("Animation", "AnimationEnd"),
      animationiteration: makePrefixMap("Animation", "AnimationIteration"),
      animationstart: makePrefixMap("Animation", "AnimationStart"),
      transitionrun: makePrefixMap("Transition", "TransitionRun"),
      transitionstart: makePrefixMap("Transition", "TransitionStart"),
      transitioncancel: makePrefixMap("Transition", "TransitionCancel"),
      transitionend: makePrefixMap("Transition", "TransitionEnd")
    };
    var prefixedEventNames = {};
    var style = {};
    canUseDOM && (style = document.createElement("div").style, "AnimationEvent" in window || (delete vendorPrefixes.animationend.animation, delete vendorPrefixes.animationiteration.animation, delete vendorPrefixes.animationstart.animation), "TransitionEvent" in window || delete vendorPrefixes.transitionend.transition);
    function getVendorPrefixedEventName(eventName) {
      if (prefixedEventNames[eventName]) return prefixedEventNames[eventName];
      if (!vendorPrefixes[eventName]) return eventName;
      var prefixMap = vendorPrefixes[eventName], styleProp;
      for (styleProp in prefixMap)
        if (prefixMap.hasOwnProperty(styleProp) && styleProp in style)
          return prefixedEventNames[eventName] = prefixMap[styleProp];
      return eventName;
    }
    var ANIMATION_END = getVendorPrefixedEventName("animationend");
    var ANIMATION_ITERATION = getVendorPrefixedEventName("animationiteration");
    var ANIMATION_START = getVendorPrefixedEventName("animationstart");
    var TRANSITION_RUN = getVendorPrefixedEventName("transitionrun");
    var TRANSITION_START = getVendorPrefixedEventName("transitionstart");
    var TRANSITION_CANCEL = getVendorPrefixedEventName("transitioncancel");
    var TRANSITION_END = getVendorPrefixedEventName("transitionend");
    var topLevelEventsToReactNames = /* @__PURE__ */ new Map();
    var simpleEventPluginEvents = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
      " "
    );
    simpleEventPluginEvents.push("scrollEnd");
    function registerSimpleEvent(domEventName, reactName) {
      topLevelEventsToReactNames.set(domEventName, reactName);
      registerTwoPhaseEvent(reactName, [domEventName]);
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
    var concurrentQueues = [];
    var concurrentQueuesIndex = 0;
    var concurrentlyUpdatedLanes = 0;
    function finishQueueingConcurrentUpdates() {
      for (var endIndex = concurrentQueuesIndex, i = concurrentlyUpdatedLanes = concurrentQueuesIndex = 0; i < endIndex; ) {
        var fiber = concurrentQueues[i];
        concurrentQueues[i++] = null;
        var queue = concurrentQueues[i];
        concurrentQueues[i++] = null;
        var update2 = concurrentQueues[i];
        concurrentQueues[i++] = null;
        var lane = concurrentQueues[i];
        concurrentQueues[i++] = null;
        if (null !== queue && null !== update2) {
          var pending = queue.pending;
          null === pending ? update2.next = update2 : (update2.next = pending.next, pending.next = update2);
          queue.pending = update2;
        }
        0 !== lane && markUpdateLaneFromFiberToRoot(fiber, update2, lane);
      }
    }
    function enqueueUpdate$1(fiber, queue, update2, lane) {
      concurrentQueues[concurrentQueuesIndex++] = fiber;
      concurrentQueues[concurrentQueuesIndex++] = queue;
      concurrentQueues[concurrentQueuesIndex++] = update2;
      concurrentQueues[concurrentQueuesIndex++] = lane;
      concurrentlyUpdatedLanes |= lane;
      fiber.lanes |= lane;
      fiber = fiber.alternate;
      null !== fiber && (fiber.lanes |= lane);
    }
    function enqueueConcurrentHookUpdate(fiber, queue, update2, lane) {
      enqueueUpdate$1(fiber, queue, update2, lane);
      return getRootForUpdatedFiber(fiber);
    }
    function enqueueConcurrentRenderForLane(fiber, lane) {
      enqueueUpdate$1(fiber, null, null, lane);
      return getRootForUpdatedFiber(fiber);
    }
    function markUpdateLaneFromFiberToRoot(sourceFiber, update2, lane) {
      sourceFiber.lanes |= lane;
      var alternate = sourceFiber.alternate;
      null !== alternate && (alternate.lanes |= lane);
      for (var isHidden = false, parent = sourceFiber.return; null !== parent; )
        parent.childLanes |= lane, alternate = parent.alternate, null !== alternate && (alternate.childLanes |= lane), 22 === parent.tag && (sourceFiber = parent.stateNode, null === sourceFiber || sourceFiber._visibility & 1 || (isHidden = true)), sourceFiber = parent, parent = parent.return;
      return 3 === sourceFiber.tag ? (parent = sourceFiber.stateNode, isHidden && null !== update2 && (isHidden = 31 - clz32(lane), sourceFiber = parent.hiddenUpdates, alternate = sourceFiber[isHidden], null === alternate ? sourceFiber[isHidden] = [update2] : alternate.push(update2), update2.lane = lane | 536870912), parent) : null;
    }
    function getRootForUpdatedFiber(sourceFiber) {
      if (50 < nestedUpdateCount)
        throw nestedUpdateCount = 0, rootWithNestedUpdates = null, Error(formatProdErrorMessage(185));
      for (var parent = sourceFiber.return; null !== parent; )
        sourceFiber = parent, parent = sourceFiber.return;
      return 3 === sourceFiber.tag ? sourceFiber.stateNode : null;
    }
    var emptyContextObject = {};
    function FiberNode(tag, pendingProps, key, mode) {
      this.tag = tag;
      this.key = key;
      this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
      this.index = 0;
      this.refCleanup = this.ref = null;
      this.pendingProps = pendingProps;
      this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
      this.mode = mode;
      this.subtreeFlags = this.flags = 0;
      this.deletions = null;
      this.childLanes = this.lanes = 0;
      this.alternate = null;
    }
    function createFiberImplClass(tag, pendingProps, key, mode) {
      return new FiberNode(tag, pendingProps, key, mode);
    }
    function shouldConstruct(Component) {
      Component = Component.prototype;
      return !(!Component || !Component.isReactComponent);
    }
    function createWorkInProgress(current, pendingProps) {
      var workInProgress2 = current.alternate;
      null === workInProgress2 ? (workInProgress2 = createFiberImplClass(
        current.tag,
        pendingProps,
        current.key,
        current.mode
      ), workInProgress2.elementType = current.elementType, workInProgress2.type = current.type, workInProgress2.stateNode = current.stateNode, workInProgress2.alternate = current, current.alternate = workInProgress2) : (workInProgress2.pendingProps = pendingProps, workInProgress2.type = current.type, workInProgress2.flags = 0, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null);
      workInProgress2.flags = current.flags & 65011712;
      workInProgress2.childLanes = current.childLanes;
      workInProgress2.lanes = current.lanes;
      workInProgress2.child = current.child;
      workInProgress2.memoizedProps = current.memoizedProps;
      workInProgress2.memoizedState = current.memoizedState;
      workInProgress2.updateQueue = current.updateQueue;
      pendingProps = current.dependencies;
      workInProgress2.dependencies = null === pendingProps ? null : { lanes: pendingProps.lanes, firstContext: pendingProps.firstContext };
      workInProgress2.sibling = current.sibling;
      workInProgress2.index = current.index;
      workInProgress2.ref = current.ref;
      workInProgress2.refCleanup = current.refCleanup;
      return workInProgress2;
    }
    function resetWorkInProgress(workInProgress2, renderLanes2) {
      workInProgress2.flags &= 65011714;
      var current = workInProgress2.alternate;
      null === current ? (workInProgress2.childLanes = 0, workInProgress2.lanes = renderLanes2, workInProgress2.child = null, workInProgress2.subtreeFlags = 0, workInProgress2.memoizedProps = null, workInProgress2.memoizedState = null, workInProgress2.updateQueue = null, workInProgress2.dependencies = null, workInProgress2.stateNode = null) : (workInProgress2.childLanes = current.childLanes, workInProgress2.lanes = current.lanes, workInProgress2.child = current.child, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null, workInProgress2.memoizedProps = current.memoizedProps, workInProgress2.memoizedState = current.memoizedState, workInProgress2.updateQueue = current.updateQueue, workInProgress2.type = current.type, renderLanes2 = current.dependencies, workInProgress2.dependencies = null === renderLanes2 ? null : {
        lanes: renderLanes2.lanes,
        firstContext: renderLanes2.firstContext
      });
      return workInProgress2;
    }
    function createFiberFromTypeAndProps(type, key, pendingProps, owner, mode, lanes) {
      var fiberTag = 0;
      owner = type;
      if ("function" === typeof type) shouldConstruct(type) && (fiberTag = 1);
      else if ("string" === typeof type)
        fiberTag = isHostHoistableType(
          type,
          pendingProps,
          contextStackCursor.current
        ) ? 26 : "html" === type || "head" === type || "body" === type ? 27 : 5;
      else
        a: switch (type) {
          case REACT_ACTIVITY_TYPE:
            return type = createFiberImplClass(31, pendingProps, key, mode), type.elementType = REACT_ACTIVITY_TYPE, type.lanes = lanes, type;
          case REACT_FRAGMENT_TYPE:
            return createFiberFromFragment(pendingProps.children, mode, lanes, key);
          case REACT_STRICT_MODE_TYPE:
            fiberTag = 8;
            mode |= 24;
            break;
          case REACT_PROFILER_TYPE:
            return type = createFiberImplClass(12, pendingProps, key, mode | 2), type.elementType = REACT_PROFILER_TYPE, type.lanes = lanes, type;
          case REACT_SUSPENSE_TYPE:
            return type = createFiberImplClass(13, pendingProps, key, mode), type.elementType = REACT_SUSPENSE_TYPE, type.lanes = lanes, type;
          case REACT_SUSPENSE_LIST_TYPE:
            return type = createFiberImplClass(19, pendingProps, key, mode), type.elementType = REACT_SUSPENSE_LIST_TYPE, type.lanes = lanes, type;
          default:
            if ("object" === typeof type && null !== type)
              switch (type.$$typeof) {
                case REACT_CONTEXT_TYPE:
                  fiberTag = 10;
                  break a;
                case REACT_CONSUMER_TYPE:
                  fiberTag = 9;
                  break a;
                case REACT_FORWARD_REF_TYPE:
                  fiberTag = 11;
                  break a;
                case REACT_MEMO_TYPE:
                  fiberTag = 14;
                  break a;
                case REACT_LAZY_TYPE:
                  fiberTag = 16;
                  owner = null;
                  break a;
              }
            fiberTag = 29;
            pendingProps = Error(
              formatProdErrorMessage(130, null === type ? "null" : typeof type, "")
            );
            owner = null;
        }
      key = createFiberImplClass(fiberTag, pendingProps, key, mode);
      key.elementType = type;
      key.type = owner;
      key.lanes = lanes;
      return key;
    }
    function createFiberFromFragment(elements, mode, lanes, key) {
      elements = createFiberImplClass(7, elements, key, mode);
      elements.lanes = lanes;
      return elements;
    }
    function createFiberFromText(content, mode, lanes) {
      content = createFiberImplClass(6, content, null, mode);
      content.lanes = lanes;
      return content;
    }
    function createFiberFromDehydratedFragment(dehydratedNode) {
      var fiber = createFiberImplClass(18, null, null, 0);
      fiber.stateNode = dehydratedNode;
      return fiber;
    }
    function createFiberFromPortal(portal, mode, lanes) {
      mode = createFiberImplClass(
        4,
        null !== portal.children ? portal.children : [],
        portal.key,
        mode
      );
      mode.lanes = lanes;
      mode.stateNode = {
        containerInfo: portal.containerInfo,
        pendingChildren: null,
        implementation: portal.implementation
      };
      return mode;
    }
    var CapturedStacks = /* @__PURE__ */ new WeakMap();
    function createCapturedValueAtFiber(value, source) {
      if ("object" === typeof value && null !== value) {
        var existing = CapturedStacks.get(value);
        if (void 0 !== existing) return existing;
        source = {
          value,
          source,
          stack: getStackByFiberInDevAndProd(source)
        };
        CapturedStacks.set(value, source);
        return source;
      }
      return {
        value,
        source,
        stack: getStackByFiberInDevAndProd(source)
      };
    }
    var forkStack = [];
    var forkStackIndex = 0;
    var treeForkProvider = null;
    var treeForkCount = 0;
    var idStack = [];
    var idStackIndex = 0;
    var treeContextProvider = null;
    var treeContextId = 1;
    var treeContextOverflow = "";
    function pushTreeFork(workInProgress2, totalChildren) {
      forkStack[forkStackIndex++] = treeForkCount;
      forkStack[forkStackIndex++] = treeForkProvider;
      treeForkProvider = workInProgress2;
      treeForkCount = totalChildren;
    }
    function pushTreeId(workInProgress2, totalChildren, index2) {
      idStack[idStackIndex++] = treeContextId;
      idStack[idStackIndex++] = treeContextOverflow;
      idStack[idStackIndex++] = treeContextProvider;
      treeContextProvider = workInProgress2;
      var baseIdWithLeadingBit = treeContextId;
      workInProgress2 = treeContextOverflow;
      var baseLength = 32 - clz32(baseIdWithLeadingBit) - 1;
      baseIdWithLeadingBit &= ~(1 << baseLength);
      index2 += 1;
      var length = 32 - clz32(totalChildren) + baseLength;
      if (30 < length) {
        var numberOfOverflowBits = baseLength - baseLength % 5;
        length = (baseIdWithLeadingBit & (1 << numberOfOverflowBits) - 1).toString(32);
        baseIdWithLeadingBit >>= numberOfOverflowBits;
        baseLength -= numberOfOverflowBits;
        treeContextId = 1 << 32 - clz32(totalChildren) + baseLength | index2 << baseLength | baseIdWithLeadingBit;
        treeContextOverflow = length + workInProgress2;
      } else
        treeContextId = 1 << length | index2 << baseLength | baseIdWithLeadingBit, treeContextOverflow = workInProgress2;
    }
    function pushMaterializedTreeId(workInProgress2) {
      null !== workInProgress2.return && (pushTreeFork(workInProgress2, 1), pushTreeId(workInProgress2, 1, 0));
    }
    function popTreeContext(workInProgress2) {
      for (; workInProgress2 === treeForkProvider; )
        treeForkProvider = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null, treeForkCount = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null;
      for (; workInProgress2 === treeContextProvider; )
        treeContextProvider = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextOverflow = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextId = idStack[--idStackIndex], idStack[idStackIndex] = null;
    }
    function restoreSuspendedTreeContext(workInProgress2, suspendedContext) {
      idStack[idStackIndex++] = treeContextId;
      idStack[idStackIndex++] = treeContextOverflow;
      idStack[idStackIndex++] = treeContextProvider;
      treeContextId = suspendedContext.id;
      treeContextOverflow = suspendedContext.overflow;
      treeContextProvider = workInProgress2;
    }
    var hydrationParentFiber = null;
    var nextHydratableInstance = null;
    var isHydrating = false;
    var hydrationErrors = null;
    var rootOrSingletonContext = false;
    var HydrationMismatchException = Error(formatProdErrorMessage(519));
    function throwOnHydrationMismatch(fiber) {
      var error = Error(
        formatProdErrorMessage(
          418,
          1 < arguments.length && void 0 !== arguments[1] && arguments[1] ? "text" : "HTML",
          ""
        )
      );
      queueHydrationError(createCapturedValueAtFiber(error, fiber));
      throw HydrationMismatchException;
    }
    function prepareToHydrateHostInstance(fiber) {
      var instance = fiber.stateNode, type = fiber.type, props = fiber.memoizedProps;
      instance[internalInstanceKey] = fiber;
      instance[internalPropsKey] = props;
      switch (type) {
        case "dialog":
          listenToNonDelegatedEvent("cancel", instance);
          listenToNonDelegatedEvent("close", instance);
          break;
        case "iframe":
        case "object":
        case "embed":
          listenToNonDelegatedEvent("load", instance);
          break;
        case "video":
        case "audio":
          for (type = 0; type < mediaEventTypes.length; type++)
            listenToNonDelegatedEvent(mediaEventTypes[type], instance);
          break;
        case "source":
          listenToNonDelegatedEvent("error", instance);
          break;
        case "img":
        case "image":
        case "link":
          listenToNonDelegatedEvent("error", instance);
          listenToNonDelegatedEvent("load", instance);
          break;
        case "details":
          listenToNonDelegatedEvent("toggle", instance);
          break;
        case "input":
          listenToNonDelegatedEvent("invalid", instance);
          initInput(
            instance,
            props.value,
            props.defaultValue,
            props.checked,
            props.defaultChecked,
            props.type,
            props.name,
            true
          );
          break;
        case "select":
          listenToNonDelegatedEvent("invalid", instance);
          break;
        case "textarea":
          listenToNonDelegatedEvent("invalid", instance), initTextarea(instance, props.value, props.defaultValue, props.children);
      }
      type = props.children;
      "string" !== typeof type && "number" !== typeof type && "bigint" !== typeof type || instance.textContent === "" + type || true === props.suppressHydrationWarning || checkForUnmatchedText(instance.textContent, type) ? (null != props.popover && (listenToNonDelegatedEvent("beforetoggle", instance), listenToNonDelegatedEvent("toggle", instance)), null != props.onScroll && listenToNonDelegatedEvent("scroll", instance), null != props.onScrollEnd && listenToNonDelegatedEvent("scrollend", instance), null != props.onClick && (instance.onclick = noop$1), instance = true) : instance = false;
      instance || throwOnHydrationMismatch(fiber, true);
    }
    function popToNextHostParent(fiber) {
      for (hydrationParentFiber = fiber.return; hydrationParentFiber; )
        switch (hydrationParentFiber.tag) {
          case 5:
          case 31:
          case 13:
            rootOrSingletonContext = false;
            return;
          case 27:
          case 3:
            rootOrSingletonContext = true;
            return;
          default:
            hydrationParentFiber = hydrationParentFiber.return;
        }
    }
    function popHydrationState(fiber) {
      if (fiber !== hydrationParentFiber) return false;
      if (!isHydrating) return popToNextHostParent(fiber), isHydrating = true, false;
      var tag = fiber.tag, JSCompiler_temp;
      if (JSCompiler_temp = 3 !== tag && 27 !== tag) {
        if (JSCompiler_temp = 5 === tag)
          JSCompiler_temp = fiber.type, JSCompiler_temp = !("form" !== JSCompiler_temp && "button" !== JSCompiler_temp) || shouldSetTextContent(fiber.type, fiber.memoizedProps);
        JSCompiler_temp = !JSCompiler_temp;
      }
      JSCompiler_temp && nextHydratableInstance && throwOnHydrationMismatch(fiber);
      popToNextHostParent(fiber);
      if (13 === tag) {
        fiber = fiber.memoizedState;
        fiber = null !== fiber ? fiber.dehydrated : null;
        if (!fiber) throw Error(formatProdErrorMessage(317));
        nextHydratableInstance = getNextHydratableInstanceAfterHydrationBoundary(fiber);
      } else if (31 === tag) {
        fiber = fiber.memoizedState;
        fiber = null !== fiber ? fiber.dehydrated : null;
        if (!fiber) throw Error(formatProdErrorMessage(317));
        nextHydratableInstance = getNextHydratableInstanceAfterHydrationBoundary(fiber);
      } else
        27 === tag ? (tag = nextHydratableInstance, isSingletonScope(fiber.type) ? (fiber = previousHydratableOnEnteringScopedSingleton, previousHydratableOnEnteringScopedSingleton = null, nextHydratableInstance = fiber) : nextHydratableInstance = tag) : nextHydratableInstance = hydrationParentFiber ? getNextHydratable(fiber.stateNode.nextSibling) : null;
      return true;
    }
    function resetHydrationState() {
      nextHydratableInstance = hydrationParentFiber = null;
      isHydrating = false;
    }
    function upgradeHydrationErrorsToRecoverable() {
      var queuedErrors = hydrationErrors;
      null !== queuedErrors && (null === workInProgressRootRecoverableErrors ? workInProgressRootRecoverableErrors = queuedErrors : workInProgressRootRecoverableErrors.push.apply(
        workInProgressRootRecoverableErrors,
        queuedErrors
      ), hydrationErrors = null);
      return queuedErrors;
    }
    function queueHydrationError(error) {
      null === hydrationErrors ? hydrationErrors = [error] : hydrationErrors.push(error);
    }
    var valueCursor = createCursor(null);
    var currentlyRenderingFiber$1 = null;
    var lastContextDependency = null;
    function pushProvider(providerFiber, context, nextValue) {
      push(valueCursor, context._currentValue);
      context._currentValue = nextValue;
    }
    function popProvider(context) {
      context._currentValue = valueCursor.current;
      pop(valueCursor);
    }
    function scheduleContextWorkOnParentPath(parent, renderLanes2, propagationRoot) {
      for (; null !== parent; ) {
        var alternate = parent.alternate;
        (parent.childLanes & renderLanes2) !== renderLanes2 ? (parent.childLanes |= renderLanes2, null !== alternate && (alternate.childLanes |= renderLanes2)) : null !== alternate && (alternate.childLanes & renderLanes2) !== renderLanes2 && (alternate.childLanes |= renderLanes2);
        if (parent === propagationRoot) break;
        parent = parent.return;
      }
    }
    function propagateContextChanges(workInProgress2, contexts, renderLanes2, forcePropagateEntireTree) {
      var fiber = workInProgress2.child;
      null !== fiber && (fiber.return = workInProgress2);
      for (; null !== fiber; ) {
        var list = fiber.dependencies;
        if (null !== list) {
          var nextFiber = fiber.child;
          list = list.firstContext;
          a: for (; null !== list; ) {
            var dependency = list;
            list = fiber;
            for (var i = 0; i < contexts.length; i++)
              if (dependency.context === contexts[i]) {
                list.lanes |= renderLanes2;
                dependency = list.alternate;
                null !== dependency && (dependency.lanes |= renderLanes2);
                scheduleContextWorkOnParentPath(
                  list.return,
                  renderLanes2,
                  workInProgress2
                );
                forcePropagateEntireTree || (nextFiber = null);
                break a;
              }
            list = dependency.next;
          }
        } else if (18 === fiber.tag) {
          nextFiber = fiber.return;
          if (null === nextFiber) throw Error(formatProdErrorMessage(341));
          nextFiber.lanes |= renderLanes2;
          list = nextFiber.alternate;
          null !== list && (list.lanes |= renderLanes2);
          scheduleContextWorkOnParentPath(nextFiber, renderLanes2, workInProgress2);
          nextFiber = null;
        } else nextFiber = fiber.child;
        if (null !== nextFiber) nextFiber.return = fiber;
        else
          for (nextFiber = fiber; null !== nextFiber; ) {
            if (nextFiber === workInProgress2) {
              nextFiber = null;
              break;
            }
            fiber = nextFiber.sibling;
            if (null !== fiber) {
              fiber.return = nextFiber.return;
              nextFiber = fiber;
              break;
            }
            nextFiber = nextFiber.return;
          }
        fiber = nextFiber;
      }
    }
    function propagateParentContextChanges(current, workInProgress2, renderLanes2, forcePropagateEntireTree) {
      current = null;
      for (var parent = workInProgress2, isInsidePropagationBailout = false; null !== parent; ) {
        if (!isInsidePropagationBailout) {
          if (0 !== (parent.flags & 524288)) isInsidePropagationBailout = true;
          else if (0 !== (parent.flags & 262144)) break;
        }
        if (10 === parent.tag) {
          var currentParent = parent.alternate;
          if (null === currentParent) throw Error(formatProdErrorMessage(387));
          currentParent = currentParent.memoizedProps;
          if (null !== currentParent) {
            var context = parent.type;
            objectIs(parent.pendingProps.value, currentParent.value) || (null !== current ? current.push(context) : current = [context]);
          }
        } else if (parent === hostTransitionProviderCursor.current) {
          currentParent = parent.alternate;
          if (null === currentParent) throw Error(formatProdErrorMessage(387));
          currentParent.memoizedState.memoizedState !== parent.memoizedState.memoizedState && (null !== current ? current.push(HostTransitionContext) : current = [HostTransitionContext]);
        }
        parent = parent.return;
      }
      null !== current && propagateContextChanges(
        workInProgress2,
        current,
        renderLanes2,
        forcePropagateEntireTree
      );
      workInProgress2.flags |= 262144;
    }
    function checkIfContextChanged(currentDependencies) {
      for (currentDependencies = currentDependencies.firstContext; null !== currentDependencies; ) {
        if (!objectIs(
          currentDependencies.context._currentValue,
          currentDependencies.memoizedValue
        ))
          return true;
        currentDependencies = currentDependencies.next;
      }
      return false;
    }
    function prepareToReadContext(workInProgress2) {
      currentlyRenderingFiber$1 = workInProgress2;
      lastContextDependency = null;
      workInProgress2 = workInProgress2.dependencies;
      null !== workInProgress2 && (workInProgress2.firstContext = null);
    }
    function readContext(context) {
      return readContextForConsumer(currentlyRenderingFiber$1, context);
    }
    function readContextDuringReconciliation(consumer, context) {
      null === currentlyRenderingFiber$1 && prepareToReadContext(consumer);
      return readContextForConsumer(consumer, context);
    }
    function readContextForConsumer(consumer, context) {
      var value = context._currentValue;
      context = { context, memoizedValue: value, next: null };
      if (null === lastContextDependency) {
        if (null === consumer) throw Error(formatProdErrorMessage(308));
        lastContextDependency = context;
        consumer.dependencies = { lanes: 0, firstContext: context };
        consumer.flags |= 524288;
      } else lastContextDependency = lastContextDependency.next = context;
      return value;
    }
    var AbortControllerLocal = "undefined" !== typeof AbortController ? AbortController : function() {
      var listeners2 = [], signal = this.signal = {
        aborted: false,
        addEventListener: function(type, listener) {
          listeners2.push(listener);
        }
      };
      this.abort = function() {
        signal.aborted = true;
        listeners2.forEach(function(listener) {
          return listener();
        });
      };
    };
    var scheduleCallback$2 = Scheduler.unstable_scheduleCallback;
    var NormalPriority = Scheduler.unstable_NormalPriority;
    var CacheContext = {
      $$typeof: REACT_CONTEXT_TYPE,
      Consumer: null,
      Provider: null,
      _currentValue: null,
      _currentValue2: null,
      _threadCount: 0
    };
    function createCache() {
      return {
        controller: new AbortControllerLocal(),
        data: /* @__PURE__ */ new Map(),
        refCount: 0
      };
    }
    function releaseCache(cache) {
      cache.refCount--;
      0 === cache.refCount && scheduleCallback$2(NormalPriority, function() {
        cache.controller.abort();
      });
    }
    var currentEntangledListeners = null;
    var currentEntangledPendingCount = 0;
    var currentEntangledLane = 0;
    var currentEntangledActionThenable = null;
    function entangleAsyncAction(transition, thenable) {
      if (null === currentEntangledListeners) {
        var entangledListeners = currentEntangledListeners = [];
        currentEntangledPendingCount = 0;
        currentEntangledLane = requestTransitionLane();
        currentEntangledActionThenable = {
          status: "pending",
          value: void 0,
          then: function(resolve) {
            entangledListeners.push(resolve);
          }
        };
      }
      currentEntangledPendingCount++;
      thenable.then(pingEngtangledActionScope, pingEngtangledActionScope);
      return thenable;
    }
    function pingEngtangledActionScope() {
      if (0 === --currentEntangledPendingCount && null !== currentEntangledListeners) {
        null !== currentEntangledActionThenable && (currentEntangledActionThenable.status = "fulfilled");
        var listeners2 = currentEntangledListeners;
        currentEntangledListeners = null;
        currentEntangledLane = 0;
        currentEntangledActionThenable = null;
        for (var i = 0; i < listeners2.length; i++) (0, listeners2[i])();
      }
    }
    function chainThenableValue(thenable, result) {
      var listeners2 = [], thenableWithOverride = {
        status: "pending",
        value: null,
        reason: null,
        then: function(resolve) {
          listeners2.push(resolve);
        }
      };
      thenable.then(
        function() {
          thenableWithOverride.status = "fulfilled";
          thenableWithOverride.value = result;
          for (var i = 0; i < listeners2.length; i++) (0, listeners2[i])(result);
        },
        function(error) {
          thenableWithOverride.status = "rejected";
          thenableWithOverride.reason = error;
          for (error = 0; error < listeners2.length; error++)
            (0, listeners2[error])(void 0);
        }
      );
      return thenableWithOverride;
    }
    var prevOnStartTransitionFinish = ReactSharedInternals.S;
    ReactSharedInternals.S = function(transition, returnValue) {
      globalMostRecentTransitionTime = now();
      "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && entangleAsyncAction(transition, returnValue);
      null !== prevOnStartTransitionFinish && prevOnStartTransitionFinish(transition, returnValue);
    };
    var resumedCache = createCursor(null);
    function peekCacheFromPool() {
      var cacheResumedFromPreviousRender = resumedCache.current;
      return null !== cacheResumedFromPreviousRender ? cacheResumedFromPreviousRender : workInProgressRoot.pooledCache;
    }
    function pushTransition(offscreenWorkInProgress, prevCachePool) {
      null === prevCachePool ? push(resumedCache, resumedCache.current) : push(resumedCache, prevCachePool.pool);
    }
    function getSuspendedCache() {
      var cacheFromPool = peekCacheFromPool();
      return null === cacheFromPool ? null : { parent: CacheContext._currentValue, pool: cacheFromPool };
    }
    var SuspenseException = Error(formatProdErrorMessage(460));
    var SuspenseyCommitException = Error(formatProdErrorMessage(474));
    var SuspenseActionException = Error(formatProdErrorMessage(542));
    var noopSuspenseyCommitThenable = { then: function() {
    } };
    function isThenableResolved(thenable) {
      thenable = thenable.status;
      return "fulfilled" === thenable || "rejected" === thenable;
    }
    function trackUsedThenable(thenableState2, thenable, index2) {
      index2 = thenableState2[index2];
      void 0 === index2 ? thenableState2.push(thenable) : index2 !== thenable && (thenable.then(noop$1, noop$1), thenable = index2);
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenableState2 = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState2), thenableState2;
        default:
          if ("string" === typeof thenable.status) thenable.then(noop$1, noop$1);
          else {
            thenableState2 = workInProgressRoot;
            if (null !== thenableState2 && 100 < thenableState2.shellSuspendCounter)
              throw Error(formatProdErrorMessage(482));
            thenableState2 = thenable;
            thenableState2.status = "pending";
            thenableState2.then(
              function(fulfilledValue) {
                if ("pending" === thenable.status) {
                  var fulfilledThenable = thenable;
                  fulfilledThenable.status = "fulfilled";
                  fulfilledThenable.value = fulfilledValue;
                }
              },
              function(error) {
                if ("pending" === thenable.status) {
                  var rejectedThenable = thenable;
                  rejectedThenable.status = "rejected";
                  rejectedThenable.reason = error;
                }
              }
            );
          }
          switch (thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenableState2 = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState2), thenableState2;
          }
          suspendedThenable = thenable;
          throw SuspenseException;
      }
    }
    function resolveLazy(lazyType) {
      try {
        var init = lazyType._init;
        return init(lazyType._payload);
      } catch (x2) {
        if (null !== x2 && "object" === typeof x2 && "function" === typeof x2.then)
          throw suspendedThenable = x2, SuspenseException;
        throw x2;
      }
    }
    var suspendedThenable = null;
    function getSuspendedThenable() {
      if (null === suspendedThenable) throw Error(formatProdErrorMessage(459));
      var thenable = suspendedThenable;
      suspendedThenable = null;
      return thenable;
    }
    function checkIfUseWrappedInAsyncCatch(rejectedReason) {
      if (rejectedReason === SuspenseException || rejectedReason === SuspenseActionException)
        throw Error(formatProdErrorMessage(483));
    }
    var thenableState$1 = null;
    var thenableIndexCounter$1 = 0;
    function unwrapThenable(thenable) {
      var index2 = thenableIndexCounter$1;
      thenableIndexCounter$1 += 1;
      null === thenableState$1 && (thenableState$1 = []);
      return trackUsedThenable(thenableState$1, thenable, index2);
    }
    function coerceRef(workInProgress2, element) {
      element = element.props.ref;
      workInProgress2.ref = void 0 !== element ? element : null;
    }
    function throwOnInvalidObjectTypeImpl(returnFiber, newChild) {
      if (newChild.$$typeof === REACT_LEGACY_ELEMENT_TYPE)
        throw Error(formatProdErrorMessage(525));
      returnFiber = Object.prototype.toString.call(newChild);
      throw Error(
        formatProdErrorMessage(
          31,
          "[object Object]" === returnFiber ? "object with keys {" + Object.keys(newChild).join(", ") + "}" : returnFiber
        )
      );
    }
    function createChildReconciler(shouldTrackSideEffects) {
      function deleteChild(returnFiber, childToDelete) {
        if (shouldTrackSideEffects) {
          var deletions = returnFiber.deletions;
          null === deletions ? (returnFiber.deletions = [childToDelete], returnFiber.flags |= 16) : deletions.push(childToDelete);
        }
      }
      function deleteRemainingChildren(returnFiber, currentFirstChild) {
        if (!shouldTrackSideEffects) return null;
        for (; null !== currentFirstChild; )
          deleteChild(returnFiber, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
        return null;
      }
      function mapRemainingChildren(currentFirstChild) {
        for (var existingChildren = /* @__PURE__ */ new Map(); null !== currentFirstChild; )
          null !== currentFirstChild.key ? existingChildren.set(currentFirstChild.key, currentFirstChild) : existingChildren.set(currentFirstChild.index, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
        return existingChildren;
      }
      function useFiber(fiber, pendingProps) {
        fiber = createWorkInProgress(fiber, pendingProps);
        fiber.index = 0;
        fiber.sibling = null;
        return fiber;
      }
      function placeChild(newFiber, lastPlacedIndex, newIndex) {
        newFiber.index = newIndex;
        if (!shouldTrackSideEffects)
          return newFiber.flags |= 1048576, lastPlacedIndex;
        newIndex = newFiber.alternate;
        if (null !== newIndex)
          return newIndex = newIndex.index, newIndex < lastPlacedIndex ? (newFiber.flags |= 67108866, lastPlacedIndex) : newIndex;
        newFiber.flags |= 67108866;
        return lastPlacedIndex;
      }
      function placeSingleChild(newFiber) {
        shouldTrackSideEffects && null === newFiber.alternate && (newFiber.flags |= 67108866);
        return newFiber;
      }
      function updateTextNode(returnFiber, current, textContent, lanes) {
        if (null === current || 6 !== current.tag)
          return current = createFiberFromText(textContent, returnFiber.mode, lanes), current.return = returnFiber, current;
        current = useFiber(current, textContent);
        current.return = returnFiber;
        return current;
      }
      function updateElement(returnFiber, current, element, lanes) {
        var elementType = element.type;
        if (elementType === REACT_FRAGMENT_TYPE)
          return updateFragment(
            returnFiber,
            current,
            element.props.children,
            lanes,
            element.key
          );
        if (null !== current && (current.elementType === elementType || "object" === typeof elementType && null !== elementType && elementType.$$typeof === REACT_LAZY_TYPE && resolveLazy(elementType) === current.type))
          return current = useFiber(current, element.props), coerceRef(current, element), current.return = returnFiber, current;
        current = createFiberFromTypeAndProps(
          element.type,
          element.key,
          element.props,
          null,
          returnFiber.mode,
          lanes
        );
        coerceRef(current, element);
        current.return = returnFiber;
        return current;
      }
      function updatePortal(returnFiber, current, portal, lanes) {
        if (null === current || 4 !== current.tag || current.stateNode.containerInfo !== portal.containerInfo || current.stateNode.implementation !== portal.implementation)
          return current = createFiberFromPortal(portal, returnFiber.mode, lanes), current.return = returnFiber, current;
        current = useFiber(current, portal.children || []);
        current.return = returnFiber;
        return current;
      }
      function updateFragment(returnFiber, current, fragment, lanes, key) {
        if (null === current || 7 !== current.tag)
          return current = createFiberFromFragment(
            fragment,
            returnFiber.mode,
            lanes,
            key
          ), current.return = returnFiber, current;
        current = useFiber(current, fragment);
        current.return = returnFiber;
        return current;
      }
      function createChild(returnFiber, newChild, lanes) {
        if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
          return newChild = createFiberFromText(
            "" + newChild,
            returnFiber.mode,
            lanes
          ), newChild.return = returnFiber, newChild;
        if ("object" === typeof newChild && null !== newChild) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              return lanes = createFiberFromTypeAndProps(
                newChild.type,
                newChild.key,
                newChild.props,
                null,
                returnFiber.mode,
                lanes
              ), coerceRef(lanes, newChild), lanes.return = returnFiber, lanes;
            case REACT_PORTAL_TYPE:
              return newChild = createFiberFromPortal(
                newChild,
                returnFiber.mode,
                lanes
              ), newChild.return = returnFiber, newChild;
            case REACT_LAZY_TYPE:
              return newChild = resolveLazy(newChild), createChild(returnFiber, newChild, lanes);
          }
          if (isArrayImpl(newChild) || getIteratorFn(newChild))
            return newChild = createFiberFromFragment(
              newChild,
              returnFiber.mode,
              lanes,
              null
            ), newChild.return = returnFiber, newChild;
          if ("function" === typeof newChild.then)
            return createChild(returnFiber, unwrapThenable(newChild), lanes);
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return createChild(
              returnFiber,
              readContextDuringReconciliation(returnFiber, newChild),
              lanes
            );
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return null;
      }
      function updateSlot(returnFiber, oldFiber, newChild, lanes) {
        var key = null !== oldFiber ? oldFiber.key : null;
        if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
          return null !== key ? null : updateTextNode(returnFiber, oldFiber, "" + newChild, lanes);
        if ("object" === typeof newChild && null !== newChild) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              return newChild.key === key ? updateElement(returnFiber, oldFiber, newChild, lanes) : null;
            case REACT_PORTAL_TYPE:
              return newChild.key === key ? updatePortal(returnFiber, oldFiber, newChild, lanes) : null;
            case REACT_LAZY_TYPE:
              return newChild = resolveLazy(newChild), updateSlot(returnFiber, oldFiber, newChild, lanes);
          }
          if (isArrayImpl(newChild) || getIteratorFn(newChild))
            return null !== key ? null : updateFragment(returnFiber, oldFiber, newChild, lanes, null);
          if ("function" === typeof newChild.then)
            return updateSlot(
              returnFiber,
              oldFiber,
              unwrapThenable(newChild),
              lanes
            );
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return updateSlot(
              returnFiber,
              oldFiber,
              readContextDuringReconciliation(returnFiber, newChild),
              lanes
            );
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return null;
      }
      function updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes) {
        if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
          return existingChildren = existingChildren.get(newIdx) || null, updateTextNode(returnFiber, existingChildren, "" + newChild, lanes);
        if ("object" === typeof newChild && null !== newChild) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              return existingChildren = existingChildren.get(
                null === newChild.key ? newIdx : newChild.key
              ) || null, updateElement(returnFiber, existingChildren, newChild, lanes);
            case REACT_PORTAL_TYPE:
              return existingChildren = existingChildren.get(
                null === newChild.key ? newIdx : newChild.key
              ) || null, updatePortal(returnFiber, existingChildren, newChild, lanes);
            case REACT_LAZY_TYPE:
              return newChild = resolveLazy(newChild), updateFromMap(
                existingChildren,
                returnFiber,
                newIdx,
                newChild,
                lanes
              );
          }
          if (isArrayImpl(newChild) || getIteratorFn(newChild))
            return existingChildren = existingChildren.get(newIdx) || null, updateFragment(returnFiber, existingChildren, newChild, lanes, null);
          if ("function" === typeof newChild.then)
            return updateFromMap(
              existingChildren,
              returnFiber,
              newIdx,
              unwrapThenable(newChild),
              lanes
            );
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return updateFromMap(
              existingChildren,
              returnFiber,
              newIdx,
              readContextDuringReconciliation(returnFiber, newChild),
              lanes
            );
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return null;
      }
      function reconcileChildrenArray(returnFiber, currentFirstChild, newChildren, lanes) {
        for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null; null !== oldFiber && newIdx < newChildren.length; newIdx++) {
          oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
          var newFiber = updateSlot(
            returnFiber,
            oldFiber,
            newChildren[newIdx],
            lanes
          );
          if (null === newFiber) {
            null === oldFiber && (oldFiber = nextOldFiber);
            break;
          }
          shouldTrackSideEffects && oldFiber && null === newFiber.alternate && deleteChild(returnFiber, oldFiber);
          currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
          null === previousNewFiber ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
          previousNewFiber = newFiber;
          oldFiber = nextOldFiber;
        }
        if (newIdx === newChildren.length)
          return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
        if (null === oldFiber) {
          for (; newIdx < newChildren.length; newIdx++)
            oldFiber = createChild(returnFiber, newChildren[newIdx], lanes), null !== oldFiber && (currentFirstChild = placeChild(
              oldFiber,
              currentFirstChild,
              newIdx
            ), null === previousNewFiber ? resultingFirstChild = oldFiber : previousNewFiber.sibling = oldFiber, previousNewFiber = oldFiber);
          isHydrating && pushTreeFork(returnFiber, newIdx);
          return resultingFirstChild;
        }
        for (oldFiber = mapRemainingChildren(oldFiber); newIdx < newChildren.length; newIdx++)
          nextOldFiber = updateFromMap(
            oldFiber,
            returnFiber,
            newIdx,
            newChildren[newIdx],
            lanes
          ), null !== nextOldFiber && (shouldTrackSideEffects && null !== nextOldFiber.alternate && oldFiber.delete(
            null === nextOldFiber.key ? newIdx : nextOldFiber.key
          ), currentFirstChild = placeChild(
            nextOldFiber,
            currentFirstChild,
            newIdx
          ), null === previousNewFiber ? resultingFirstChild = nextOldFiber : previousNewFiber.sibling = nextOldFiber, previousNewFiber = nextOldFiber);
        shouldTrackSideEffects && oldFiber.forEach(function(child) {
          return deleteChild(returnFiber, child);
        });
        isHydrating && pushTreeFork(returnFiber, newIdx);
        return resultingFirstChild;
      }
      function reconcileChildrenIterator(returnFiber, currentFirstChild, newChildren, lanes) {
        if (null == newChildren) throw Error(formatProdErrorMessage(151));
        for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null, step = newChildren.next(); null !== oldFiber && !step.done; newIdx++, step = newChildren.next()) {
          oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
          var newFiber = updateSlot(returnFiber, oldFiber, step.value, lanes);
          if (null === newFiber) {
            null === oldFiber && (oldFiber = nextOldFiber);
            break;
          }
          shouldTrackSideEffects && oldFiber && null === newFiber.alternate && deleteChild(returnFiber, oldFiber);
          currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
          null === previousNewFiber ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
          previousNewFiber = newFiber;
          oldFiber = nextOldFiber;
        }
        if (step.done)
          return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
        if (null === oldFiber) {
          for (; !step.done; newIdx++, step = newChildren.next())
            step = createChild(returnFiber, step.value, lanes), null !== step && (currentFirstChild = placeChild(step, currentFirstChild, newIdx), null === previousNewFiber ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
          isHydrating && pushTreeFork(returnFiber, newIdx);
          return resultingFirstChild;
        }
        for (oldFiber = mapRemainingChildren(oldFiber); !step.done; newIdx++, step = newChildren.next())
          step = updateFromMap(oldFiber, returnFiber, newIdx, step.value, lanes), null !== step && (shouldTrackSideEffects && null !== step.alternate && oldFiber.delete(null === step.key ? newIdx : step.key), currentFirstChild = placeChild(step, currentFirstChild, newIdx), null === previousNewFiber ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
        shouldTrackSideEffects && oldFiber.forEach(function(child) {
          return deleteChild(returnFiber, child);
        });
        isHydrating && pushTreeFork(returnFiber, newIdx);
        return resultingFirstChild;
      }
      function reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes) {
        "object" === typeof newChild && null !== newChild && newChild.type === REACT_FRAGMENT_TYPE && null === newChild.key && (newChild = newChild.props.children);
        if ("object" === typeof newChild && null !== newChild) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              a: {
                for (var key = newChild.key; null !== currentFirstChild; ) {
                  if (currentFirstChild.key === key) {
                    key = newChild.type;
                    if (key === REACT_FRAGMENT_TYPE) {
                      if (7 === currentFirstChild.tag) {
                        deleteRemainingChildren(
                          returnFiber,
                          currentFirstChild.sibling
                        );
                        lanes = useFiber(
                          currentFirstChild,
                          newChild.props.children
                        );
                        lanes.return = returnFiber;
                        returnFiber = lanes;
                        break a;
                      }
                    } else if (currentFirstChild.elementType === key || "object" === typeof key && null !== key && key.$$typeof === REACT_LAZY_TYPE && resolveLazy(key) === currentFirstChild.type) {
                      deleteRemainingChildren(
                        returnFiber,
                        currentFirstChild.sibling
                      );
                      lanes = useFiber(currentFirstChild, newChild.props);
                      coerceRef(lanes, newChild);
                      lanes.return = returnFiber;
                      returnFiber = lanes;
                      break a;
                    }
                    deleteRemainingChildren(returnFiber, currentFirstChild);
                    break;
                  } else deleteChild(returnFiber, currentFirstChild);
                  currentFirstChild = currentFirstChild.sibling;
                }
                newChild.type === REACT_FRAGMENT_TYPE ? (lanes = createFiberFromFragment(
                  newChild.props.children,
                  returnFiber.mode,
                  lanes,
                  newChild.key
                ), lanes.return = returnFiber, returnFiber = lanes) : (lanes = createFiberFromTypeAndProps(
                  newChild.type,
                  newChild.key,
                  newChild.props,
                  null,
                  returnFiber.mode,
                  lanes
                ), coerceRef(lanes, newChild), lanes.return = returnFiber, returnFiber = lanes);
              }
              return placeSingleChild(returnFiber);
            case REACT_PORTAL_TYPE:
              a: {
                for (key = newChild.key; null !== currentFirstChild; ) {
                  if (currentFirstChild.key === key)
                    if (4 === currentFirstChild.tag && currentFirstChild.stateNode.containerInfo === newChild.containerInfo && currentFirstChild.stateNode.implementation === newChild.implementation) {
                      deleteRemainingChildren(
                        returnFiber,
                        currentFirstChild.sibling
                      );
                      lanes = useFiber(currentFirstChild, newChild.children || []);
                      lanes.return = returnFiber;
                      returnFiber = lanes;
                      break a;
                    } else {
                      deleteRemainingChildren(returnFiber, currentFirstChild);
                      break;
                    }
                  else deleteChild(returnFiber, currentFirstChild);
                  currentFirstChild = currentFirstChild.sibling;
                }
                lanes = createFiberFromPortal(newChild, returnFiber.mode, lanes);
                lanes.return = returnFiber;
                returnFiber = lanes;
              }
              return placeSingleChild(returnFiber);
            case REACT_LAZY_TYPE:
              return newChild = resolveLazy(newChild), reconcileChildFibersImpl(
                returnFiber,
                currentFirstChild,
                newChild,
                lanes
              );
          }
          if (isArrayImpl(newChild))
            return reconcileChildrenArray(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes
            );
          if (getIteratorFn(newChild)) {
            key = getIteratorFn(newChild);
            if ("function" !== typeof key) throw Error(formatProdErrorMessage(150));
            newChild = key.call(newChild);
            return reconcileChildrenIterator(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes
            );
          }
          if ("function" === typeof newChild.then)
            return reconcileChildFibersImpl(
              returnFiber,
              currentFirstChild,
              unwrapThenable(newChild),
              lanes
            );
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return reconcileChildFibersImpl(
              returnFiber,
              currentFirstChild,
              readContextDuringReconciliation(returnFiber, newChild),
              lanes
            );
          throwOnInvalidObjectTypeImpl(returnFiber, newChild);
        }
        return "string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild ? (newChild = "" + newChild, null !== currentFirstChild && 6 === currentFirstChild.tag ? (deleteRemainingChildren(returnFiber, currentFirstChild.sibling), lanes = useFiber(currentFirstChild, newChild), lanes.return = returnFiber, returnFiber = lanes) : (deleteRemainingChildren(returnFiber, currentFirstChild), lanes = createFiberFromText(newChild, returnFiber.mode, lanes), lanes.return = returnFiber, returnFiber = lanes), placeSingleChild(returnFiber)) : deleteRemainingChildren(returnFiber, currentFirstChild);
      }
      return function(returnFiber, currentFirstChild, newChild, lanes) {
        try {
          thenableIndexCounter$1 = 0;
          var firstChildFiber = reconcileChildFibersImpl(
            returnFiber,
            currentFirstChild,
            newChild,
            lanes
          );
          thenableState$1 = null;
          return firstChildFiber;
        } catch (x2) {
          if (x2 === SuspenseException || x2 === SuspenseActionException) throw x2;
          var fiber = createFiberImplClass(29, x2, null, returnFiber.mode);
          fiber.lanes = lanes;
          fiber.return = returnFiber;
          return fiber;
        } finally {
        }
      };
    }
    var reconcileChildFibers = createChildReconciler(true);
    var mountChildFibers = createChildReconciler(false);
    var hasForceUpdate = false;
    function initializeUpdateQueue(fiber) {
      fiber.updateQueue = {
        baseState: fiber.memoizedState,
        firstBaseUpdate: null,
        lastBaseUpdate: null,
        shared: { pending: null, lanes: 0, hiddenCallbacks: null },
        callbacks: null
      };
    }
    function cloneUpdateQueue(current, workInProgress2) {
      current = current.updateQueue;
      workInProgress2.updateQueue === current && (workInProgress2.updateQueue = {
        baseState: current.baseState,
        firstBaseUpdate: current.firstBaseUpdate,
        lastBaseUpdate: current.lastBaseUpdate,
        shared: current.shared,
        callbacks: null
      });
    }
    function createUpdate(lane) {
      return { lane, tag: 0, payload: null, callback: null, next: null };
    }
    function enqueueUpdate(fiber, update2, lane) {
      var updateQueue = fiber.updateQueue;
      if (null === updateQueue) return null;
      updateQueue = updateQueue.shared;
      if (0 !== (executionContext & 2)) {
        var pending = updateQueue.pending;
        null === pending ? update2.next = update2 : (update2.next = pending.next, pending.next = update2);
        updateQueue.pending = update2;
        update2 = getRootForUpdatedFiber(fiber);
        markUpdateLaneFromFiberToRoot(fiber, null, lane);
        return update2;
      }
      enqueueUpdate$1(fiber, updateQueue, update2, lane);
      return getRootForUpdatedFiber(fiber);
    }
    function entangleTransitions(root2, fiber, lane) {
      fiber = fiber.updateQueue;
      if (null !== fiber && (fiber = fiber.shared, 0 !== (lane & 4194048))) {
        var queueLanes = fiber.lanes;
        queueLanes &= root2.pendingLanes;
        lane |= queueLanes;
        fiber.lanes = lane;
        markRootEntangled(root2, lane);
      }
    }
    function enqueueCapturedUpdate(workInProgress2, capturedUpdate) {
      var queue = workInProgress2.updateQueue, current = workInProgress2.alternate;
      if (null !== current && (current = current.updateQueue, queue === current)) {
        var newFirst = null, newLast = null;
        queue = queue.firstBaseUpdate;
        if (null !== queue) {
          do {
            var clone = {
              lane: queue.lane,
              tag: queue.tag,
              payload: queue.payload,
              callback: null,
              next: null
            };
            null === newLast ? newFirst = newLast = clone : newLast = newLast.next = clone;
            queue = queue.next;
          } while (null !== queue);
          null === newLast ? newFirst = newLast = capturedUpdate : newLast = newLast.next = capturedUpdate;
        } else newFirst = newLast = capturedUpdate;
        queue = {
          baseState: current.baseState,
          firstBaseUpdate: newFirst,
          lastBaseUpdate: newLast,
          shared: current.shared,
          callbacks: current.callbacks
        };
        workInProgress2.updateQueue = queue;
        return;
      }
      workInProgress2 = queue.lastBaseUpdate;
      null === workInProgress2 ? queue.firstBaseUpdate = capturedUpdate : workInProgress2.next = capturedUpdate;
      queue.lastBaseUpdate = capturedUpdate;
    }
    var didReadFromEntangledAsyncAction = false;
    function suspendIfUpdateReadFromEntangledAsyncAction() {
      if (didReadFromEntangledAsyncAction) {
        var entangledActionThenable = currentEntangledActionThenable;
        if (null !== entangledActionThenable) throw entangledActionThenable;
      }
    }
    function processUpdateQueue(workInProgress$jscomp$0, props, instance$jscomp$0, renderLanes2) {
      didReadFromEntangledAsyncAction = false;
      var queue = workInProgress$jscomp$0.updateQueue;
      hasForceUpdate = false;
      var firstBaseUpdate = queue.firstBaseUpdate, lastBaseUpdate = queue.lastBaseUpdate, pendingQueue = queue.shared.pending;
      if (null !== pendingQueue) {
        queue.shared.pending = null;
        var lastPendingUpdate = pendingQueue, firstPendingUpdate = lastPendingUpdate.next;
        lastPendingUpdate.next = null;
        null === lastBaseUpdate ? firstBaseUpdate = firstPendingUpdate : lastBaseUpdate.next = firstPendingUpdate;
        lastBaseUpdate = lastPendingUpdate;
        var current = workInProgress$jscomp$0.alternate;
        null !== current && (current = current.updateQueue, pendingQueue = current.lastBaseUpdate, pendingQueue !== lastBaseUpdate && (null === pendingQueue ? current.firstBaseUpdate = firstPendingUpdate : pendingQueue.next = firstPendingUpdate, current.lastBaseUpdate = lastPendingUpdate));
      }
      if (null !== firstBaseUpdate) {
        var newState = queue.baseState;
        lastBaseUpdate = 0;
        current = firstPendingUpdate = lastPendingUpdate = null;
        pendingQueue = firstBaseUpdate;
        do {
          var updateLane = pendingQueue.lane & -536870913, isHiddenUpdate = updateLane !== pendingQueue.lane;
          if (isHiddenUpdate ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes2 & updateLane) === updateLane) {
            0 !== updateLane && updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction = true);
            null !== current && (current = current.next = {
              lane: 0,
              tag: pendingQueue.tag,
              payload: pendingQueue.payload,
              callback: null,
              next: null
            });
            a: {
              var workInProgress2 = workInProgress$jscomp$0, update2 = pendingQueue;
              updateLane = props;
              var instance = instance$jscomp$0;
              switch (update2.tag) {
                case 1:
                  workInProgress2 = update2.payload;
                  if ("function" === typeof workInProgress2) {
                    newState = workInProgress2.call(instance, newState, updateLane);
                    break a;
                  }
                  newState = workInProgress2;
                  break a;
                case 3:
                  workInProgress2.flags = workInProgress2.flags & -65537 | 128;
                case 0:
                  workInProgress2 = update2.payload;
                  updateLane = "function" === typeof workInProgress2 ? workInProgress2.call(instance, newState, updateLane) : workInProgress2;
                  if (null === updateLane || void 0 === updateLane) break a;
                  newState = assign({}, newState, updateLane);
                  break a;
                case 2:
                  hasForceUpdate = true;
              }
            }
            updateLane = pendingQueue.callback;
            null !== updateLane && (workInProgress$jscomp$0.flags |= 64, isHiddenUpdate && (workInProgress$jscomp$0.flags |= 8192), isHiddenUpdate = queue.callbacks, null === isHiddenUpdate ? queue.callbacks = [updateLane] : isHiddenUpdate.push(updateLane));
          } else
            isHiddenUpdate = {
              lane: updateLane,
              tag: pendingQueue.tag,
              payload: pendingQueue.payload,
              callback: pendingQueue.callback,
              next: null
            }, null === current ? (firstPendingUpdate = current = isHiddenUpdate, lastPendingUpdate = newState) : current = current.next = isHiddenUpdate, lastBaseUpdate |= updateLane;
          pendingQueue = pendingQueue.next;
          if (null === pendingQueue)
            if (pendingQueue = queue.shared.pending, null === pendingQueue)
              break;
            else
              isHiddenUpdate = pendingQueue, pendingQueue = isHiddenUpdate.next, isHiddenUpdate.next = null, queue.lastBaseUpdate = isHiddenUpdate, queue.shared.pending = null;
        } while (1);
        null === current && (lastPendingUpdate = newState);
        queue.baseState = lastPendingUpdate;
        queue.firstBaseUpdate = firstPendingUpdate;
        queue.lastBaseUpdate = current;
        null === firstBaseUpdate && (queue.shared.lanes = 0);
        workInProgressRootSkippedLanes |= lastBaseUpdate;
        workInProgress$jscomp$0.lanes = lastBaseUpdate;
        workInProgress$jscomp$0.memoizedState = newState;
      }
    }
    function callCallback(callback, context) {
      if ("function" !== typeof callback)
        throw Error(formatProdErrorMessage(191, callback));
      callback.call(context);
    }
    function commitCallbacks(updateQueue, context) {
      var callbacks = updateQueue.callbacks;
      if (null !== callbacks)
        for (updateQueue.callbacks = null, updateQueue = 0; updateQueue < callbacks.length; updateQueue++)
          callCallback(callbacks[updateQueue], context);
    }
    var currentTreeHiddenStackCursor = createCursor(null);
    var prevEntangledRenderLanesCursor = createCursor(0);
    function pushHiddenContext(fiber, context) {
      fiber = entangledRenderLanes;
      push(prevEntangledRenderLanesCursor, fiber);
      push(currentTreeHiddenStackCursor, context);
      entangledRenderLanes = fiber | context.baseLanes;
    }
    function reuseHiddenContextOnStack() {
      push(prevEntangledRenderLanesCursor, entangledRenderLanes);
      push(currentTreeHiddenStackCursor, currentTreeHiddenStackCursor.current);
    }
    function popHiddenContext() {
      entangledRenderLanes = prevEntangledRenderLanesCursor.current;
      pop(currentTreeHiddenStackCursor);
      pop(prevEntangledRenderLanesCursor);
    }
    var suspenseHandlerStackCursor = createCursor(null);
    var shellBoundary = null;
    function pushPrimaryTreeSuspenseHandler(handler) {
      var current = handler.alternate;
      push(suspenseStackCursor, suspenseStackCursor.current & 1);
      push(suspenseHandlerStackCursor, handler);
      null === shellBoundary && (null === current || null !== currentTreeHiddenStackCursor.current ? shellBoundary = handler : null !== current.memoizedState && (shellBoundary = handler));
    }
    function pushDehydratedActivitySuspenseHandler(fiber) {
      push(suspenseStackCursor, suspenseStackCursor.current);
      push(suspenseHandlerStackCursor, fiber);
      null === shellBoundary && (shellBoundary = fiber);
    }
    function pushOffscreenSuspenseHandler(fiber) {
      22 === fiber.tag ? (push(suspenseStackCursor, suspenseStackCursor.current), push(suspenseHandlerStackCursor, fiber), null === shellBoundary && (shellBoundary = fiber)) : reuseSuspenseHandlerOnStack(fiber);
    }
    function reuseSuspenseHandlerOnStack() {
      push(suspenseStackCursor, suspenseStackCursor.current);
      push(suspenseHandlerStackCursor, suspenseHandlerStackCursor.current);
    }
    function popSuspenseHandler(fiber) {
      pop(suspenseHandlerStackCursor);
      shellBoundary === fiber && (shellBoundary = null);
      pop(suspenseStackCursor);
    }
    var suspenseStackCursor = createCursor(0);
    function findFirstSuspended(row) {
      for (var node = row; null !== node; ) {
        if (13 === node.tag) {
          var state2 = node.memoizedState;
          if (null !== state2 && (state2 = state2.dehydrated, null === state2 || isSuspenseInstancePending(state2) || isSuspenseInstanceFallback(state2)))
            return node;
        } else if (19 === node.tag && ("forwards" === node.memoizedProps.revealOrder || "backwards" === node.memoizedProps.revealOrder || "unstable_legacy-backwards" === node.memoizedProps.revealOrder || "together" === node.memoizedProps.revealOrder)) {
          if (0 !== (node.flags & 128)) return node;
        } else if (null !== node.child) {
          node.child.return = node;
          node = node.child;
          continue;
        }
        if (node === row) break;
        for (; null === node.sibling; ) {
          if (null === node.return || node.return === row) return null;
          node = node.return;
        }
        node.sibling.return = node.return;
        node = node.sibling;
      }
      return null;
    }
    var renderLanes = 0;
    var currentlyRenderingFiber = null;
    var currentHook = null;
    var workInProgressHook = null;
    var didScheduleRenderPhaseUpdate = false;
    var didScheduleRenderPhaseUpdateDuringThisPass = false;
    var shouldDoubleInvokeUserFnsInHooksDEV = false;
    var localIdCounter = 0;
    var thenableIndexCounter = 0;
    var thenableState = null;
    var globalClientIdCounter = 0;
    function throwInvalidHookError() {
      throw Error(formatProdErrorMessage(321));
    }
    function areHookInputsEqual(nextDeps, prevDeps) {
      if (null === prevDeps) return false;
      for (var i = 0; i < prevDeps.length && i < nextDeps.length; i++)
        if (!objectIs(nextDeps[i], prevDeps[i])) return false;
      return true;
    }
    function renderWithHooks(current, workInProgress2, Component, props, secondArg, nextRenderLanes) {
      renderLanes = nextRenderLanes;
      currentlyRenderingFiber = workInProgress2;
      workInProgress2.memoizedState = null;
      workInProgress2.updateQueue = null;
      workInProgress2.lanes = 0;
      ReactSharedInternals.H = null === current || null === current.memoizedState ? HooksDispatcherOnMount : HooksDispatcherOnUpdate;
      shouldDoubleInvokeUserFnsInHooksDEV = false;
      nextRenderLanes = Component(props, secondArg);
      shouldDoubleInvokeUserFnsInHooksDEV = false;
      didScheduleRenderPhaseUpdateDuringThisPass && (nextRenderLanes = renderWithHooksAgain(
        workInProgress2,
        Component,
        props,
        secondArg
      ));
      finishRenderingHooks(current);
      return nextRenderLanes;
    }
    function finishRenderingHooks(current) {
      ReactSharedInternals.H = ContextOnlyDispatcher;
      var didRenderTooFewHooks = null !== currentHook && null !== currentHook.next;
      renderLanes = 0;
      workInProgressHook = currentHook = currentlyRenderingFiber = null;
      didScheduleRenderPhaseUpdate = false;
      thenableIndexCounter = 0;
      thenableState = null;
      if (didRenderTooFewHooks) throw Error(formatProdErrorMessage(300));
      null === current || didReceiveUpdate || (current = current.dependencies, null !== current && checkIfContextChanged(current) && (didReceiveUpdate = true));
    }
    function renderWithHooksAgain(workInProgress2, Component, props, secondArg) {
      currentlyRenderingFiber = workInProgress2;
      var numberOfReRenders = 0;
      do {
        didScheduleRenderPhaseUpdateDuringThisPass && (thenableState = null);
        thenableIndexCounter = 0;
        didScheduleRenderPhaseUpdateDuringThisPass = false;
        if (25 <= numberOfReRenders) throw Error(formatProdErrorMessage(301));
        numberOfReRenders += 1;
        workInProgressHook = currentHook = null;
        if (null != workInProgress2.updateQueue) {
          var children = workInProgress2.updateQueue;
          children.lastEffect = null;
          children.events = null;
          children.stores = null;
          null != children.memoCache && (children.memoCache.index = 0);
        }
        ReactSharedInternals.H = HooksDispatcherOnRerender;
        children = Component(props, secondArg);
      } while (didScheduleRenderPhaseUpdateDuringThisPass);
      return children;
    }
    function TransitionAwareHostComponent() {
      var dispatcher = ReactSharedInternals.H, maybeThenable = dispatcher.useState()[0];
      maybeThenable = "function" === typeof maybeThenable.then ? useThenable(maybeThenable) : maybeThenable;
      dispatcher = dispatcher.useState()[0];
      (null !== currentHook ? currentHook.memoizedState : null) !== dispatcher && (currentlyRenderingFiber.flags |= 1024);
      return maybeThenable;
    }
    function checkDidRenderIdHook() {
      var didRenderIdHook = 0 !== localIdCounter;
      localIdCounter = 0;
      return didRenderIdHook;
    }
    function bailoutHooks(current, workInProgress2, lanes) {
      workInProgress2.updateQueue = current.updateQueue;
      workInProgress2.flags &= -2053;
      current.lanes &= ~lanes;
    }
    function resetHooksOnUnwind(workInProgress2) {
      if (didScheduleRenderPhaseUpdate) {
        for (workInProgress2 = workInProgress2.memoizedState; null !== workInProgress2; ) {
          var queue = workInProgress2.queue;
          null !== queue && (queue.pending = null);
          workInProgress2 = workInProgress2.next;
        }
        didScheduleRenderPhaseUpdate = false;
      }
      renderLanes = 0;
      workInProgressHook = currentHook = currentlyRenderingFiber = null;
      didScheduleRenderPhaseUpdateDuringThisPass = false;
      thenableIndexCounter = localIdCounter = 0;
      thenableState = null;
    }
    function mountWorkInProgressHook() {
      var hook = {
        memoizedState: null,
        baseState: null,
        baseQueue: null,
        queue: null,
        next: null
      };
      null === workInProgressHook ? currentlyRenderingFiber.memoizedState = workInProgressHook = hook : workInProgressHook = workInProgressHook.next = hook;
      return workInProgressHook;
    }
    function updateWorkInProgressHook() {
      if (null === currentHook) {
        var nextCurrentHook = currentlyRenderingFiber.alternate;
        nextCurrentHook = null !== nextCurrentHook ? nextCurrentHook.memoizedState : null;
      } else nextCurrentHook = currentHook.next;
      var nextWorkInProgressHook = null === workInProgressHook ? currentlyRenderingFiber.memoizedState : workInProgressHook.next;
      if (null !== nextWorkInProgressHook)
        workInProgressHook = nextWorkInProgressHook, currentHook = nextCurrentHook;
      else {
        if (null === nextCurrentHook) {
          if (null === currentlyRenderingFiber.alternate)
            throw Error(formatProdErrorMessage(467));
          throw Error(formatProdErrorMessage(310));
        }
        currentHook = nextCurrentHook;
        nextCurrentHook = {
          memoizedState: currentHook.memoizedState,
          baseState: currentHook.baseState,
          baseQueue: currentHook.baseQueue,
          queue: currentHook.queue,
          next: null
        };
        null === workInProgressHook ? currentlyRenderingFiber.memoizedState = workInProgressHook = nextCurrentHook : workInProgressHook = workInProgressHook.next = nextCurrentHook;
      }
      return workInProgressHook;
    }
    function createFunctionComponentUpdateQueue() {
      return { lastEffect: null, events: null, stores: null, memoCache: null };
    }
    function useThenable(thenable) {
      var index2 = thenableIndexCounter;
      thenableIndexCounter += 1;
      null === thenableState && (thenableState = []);
      thenable = trackUsedThenable(thenableState, thenable, index2);
      index2 = currentlyRenderingFiber;
      null === (null === workInProgressHook ? index2.memoizedState : workInProgressHook.next) && (index2 = index2.alternate, ReactSharedInternals.H = null === index2 || null === index2.memoizedState ? HooksDispatcherOnMount : HooksDispatcherOnUpdate);
      return thenable;
    }
    function use(usable) {
      if (null !== usable && "object" === typeof usable) {
        if ("function" === typeof usable.then) return useThenable(usable);
        if (usable.$$typeof === REACT_CONTEXT_TYPE) return readContext(usable);
      }
      throw Error(formatProdErrorMessage(438, String(usable)));
    }
    function useMemoCache(size) {
      var memoCache = null, updateQueue = currentlyRenderingFiber.updateQueue;
      null !== updateQueue && (memoCache = updateQueue.memoCache);
      if (null == memoCache) {
        var current = currentlyRenderingFiber.alternate;
        null !== current && (current = current.updateQueue, null !== current && (current = current.memoCache, null != current && (memoCache = {
          data: current.data.map(function(array) {
            return array.slice();
          }),
          index: 0
        })));
      }
      null == memoCache && (memoCache = { data: [], index: 0 });
      null === updateQueue && (updateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = updateQueue);
      updateQueue.memoCache = memoCache;
      updateQueue = memoCache.data[memoCache.index];
      if (void 0 === updateQueue)
        for (updateQueue = memoCache.data[memoCache.index] = Array(size), current = 0; current < size; current++)
          updateQueue[current] = REACT_MEMO_CACHE_SENTINEL;
      memoCache.index++;
      return updateQueue;
    }
    function basicStateReducer(state2, action) {
      return "function" === typeof action ? action(state2) : action;
    }
    function updateReducer(reducer) {
      var hook = updateWorkInProgressHook();
      return updateReducerImpl(hook, currentHook, reducer);
    }
    function updateReducerImpl(hook, current, reducer) {
      var queue = hook.queue;
      if (null === queue) throw Error(formatProdErrorMessage(311));
      queue.lastRenderedReducer = reducer;
      var baseQueue = hook.baseQueue, pendingQueue = queue.pending;
      if (null !== pendingQueue) {
        if (null !== baseQueue) {
          var baseFirst = baseQueue.next;
          baseQueue.next = pendingQueue.next;
          pendingQueue.next = baseFirst;
        }
        current.baseQueue = baseQueue = pendingQueue;
        queue.pending = null;
      }
      pendingQueue = hook.baseState;
      if (null === baseQueue) hook.memoizedState = pendingQueue;
      else {
        current = baseQueue.next;
        var newBaseQueueFirst = baseFirst = null, newBaseQueueLast = null, update2 = current, didReadFromEntangledAsyncAction$60 = false;
        do {
          var updateLane = update2.lane & -536870913;
          if (updateLane !== update2.lane ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes & updateLane) === updateLane) {
            var revertLane = update2.revertLane;
            if (0 === revertLane)
              null !== newBaseQueueLast && (newBaseQueueLast = newBaseQueueLast.next = {
                lane: 0,
                revertLane: 0,
                gesture: null,
                action: update2.action,
                hasEagerState: update2.hasEagerState,
                eagerState: update2.eagerState,
                next: null
              }), updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction$60 = true);
            else if ((renderLanes & revertLane) === revertLane) {
              update2 = update2.next;
              revertLane === currentEntangledLane && (didReadFromEntangledAsyncAction$60 = true);
              continue;
            } else
              updateLane = {
                lane: 0,
                revertLane: update2.revertLane,
                gesture: null,
                action: update2.action,
                hasEagerState: update2.hasEagerState,
                eagerState: update2.eagerState,
                next: null
              }, null === newBaseQueueLast ? (newBaseQueueFirst = newBaseQueueLast = updateLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = updateLane, currentlyRenderingFiber.lanes |= revertLane, workInProgressRootSkippedLanes |= revertLane;
            updateLane = update2.action;
            shouldDoubleInvokeUserFnsInHooksDEV && reducer(pendingQueue, updateLane);
            pendingQueue = update2.hasEagerState ? update2.eagerState : reducer(pendingQueue, updateLane);
          } else
            revertLane = {
              lane: updateLane,
              revertLane: update2.revertLane,
              gesture: update2.gesture,
              action: update2.action,
              hasEagerState: update2.hasEagerState,
              eagerState: update2.eagerState,
              next: null
            }, null === newBaseQueueLast ? (newBaseQueueFirst = newBaseQueueLast = revertLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = revertLane, currentlyRenderingFiber.lanes |= updateLane, workInProgressRootSkippedLanes |= updateLane;
          update2 = update2.next;
        } while (null !== update2 && update2 !== current);
        null === newBaseQueueLast ? baseFirst = pendingQueue : newBaseQueueLast.next = newBaseQueueFirst;
        if (!objectIs(pendingQueue, hook.memoizedState) && (didReceiveUpdate = true, didReadFromEntangledAsyncAction$60 && (reducer = currentEntangledActionThenable, null !== reducer)))
          throw reducer;
        hook.memoizedState = pendingQueue;
        hook.baseState = baseFirst;
        hook.baseQueue = newBaseQueueLast;
        queue.lastRenderedState = pendingQueue;
      }
      null === baseQueue && (queue.lanes = 0);
      return [hook.memoizedState, queue.dispatch];
    }
    function rerenderReducer(reducer) {
      var hook = updateWorkInProgressHook(), queue = hook.queue;
      if (null === queue) throw Error(formatProdErrorMessage(311));
      queue.lastRenderedReducer = reducer;
      var dispatch = queue.dispatch, lastRenderPhaseUpdate = queue.pending, newState = hook.memoizedState;
      if (null !== lastRenderPhaseUpdate) {
        queue.pending = null;
        var update2 = lastRenderPhaseUpdate = lastRenderPhaseUpdate.next;
        do
          newState = reducer(newState, update2.action), update2 = update2.next;
        while (update2 !== lastRenderPhaseUpdate);
        objectIs(newState, hook.memoizedState) || (didReceiveUpdate = true);
        hook.memoizedState = newState;
        null === hook.baseQueue && (hook.baseState = newState);
        queue.lastRenderedState = newState;
      }
      return [newState, dispatch];
    }
    function updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      var fiber = currentlyRenderingFiber, hook = updateWorkInProgressHook(), isHydrating$jscomp$0 = isHydrating;
      if (isHydrating$jscomp$0) {
        if (void 0 === getServerSnapshot) throw Error(formatProdErrorMessage(407));
        getServerSnapshot = getServerSnapshot();
      } else getServerSnapshot = getSnapshot();
      var snapshotChanged = !objectIs(
        (currentHook || hook).memoizedState,
        getServerSnapshot
      );
      snapshotChanged && (hook.memoizedState = getServerSnapshot, didReceiveUpdate = true);
      hook = hook.queue;
      updateEffect(subscribeToStore.bind(null, fiber, hook, subscribe), [
        subscribe
      ]);
      if (hook.getSnapshot !== getSnapshot || snapshotChanged || null !== workInProgressHook && workInProgressHook.memoizedState.tag & 1) {
        fiber.flags |= 2048;
        pushSimpleEffect(
          9,
          { destroy: void 0 },
          updateStoreInstance.bind(
            null,
            fiber,
            hook,
            getServerSnapshot,
            getSnapshot
          ),
          null
        );
        if (null === workInProgressRoot) throw Error(formatProdErrorMessage(349));
        isHydrating$jscomp$0 || 0 !== (renderLanes & 127) || pushStoreConsistencyCheck(fiber, getSnapshot, getServerSnapshot);
      }
      return getServerSnapshot;
    }
    function pushStoreConsistencyCheck(fiber, getSnapshot, renderedSnapshot) {
      fiber.flags |= 16384;
      fiber = { getSnapshot, value: renderedSnapshot };
      getSnapshot = currentlyRenderingFiber.updateQueue;
      null === getSnapshot ? (getSnapshot = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = getSnapshot, getSnapshot.stores = [fiber]) : (renderedSnapshot = getSnapshot.stores, null === renderedSnapshot ? getSnapshot.stores = [fiber] : renderedSnapshot.push(fiber));
    }
    function updateStoreInstance(fiber, inst, nextSnapshot, getSnapshot) {
      inst.value = nextSnapshot;
      inst.getSnapshot = getSnapshot;
      checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
    }
    function subscribeToStore(fiber, inst, subscribe) {
      return subscribe(function() {
        checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
      });
    }
    function checkIfSnapshotChanged(inst) {
      var latestGetSnapshot = inst.getSnapshot;
      inst = inst.value;
      try {
        var nextValue = latestGetSnapshot();
        return !objectIs(inst, nextValue);
      } catch (error) {
        return true;
      }
    }
    function forceStoreRerender(fiber) {
      var root2 = enqueueConcurrentRenderForLane(fiber, 2);
      null !== root2 && scheduleUpdateOnFiber(root2, fiber, 2);
    }
    function mountStateImpl(initialState) {
      var hook = mountWorkInProgressHook();
      if ("function" === typeof initialState) {
        var initialStateInitializer = initialState;
        initialState = initialStateInitializer();
        if (shouldDoubleInvokeUserFnsInHooksDEV) {
          setIsStrictModeForDevtools(true);
          try {
            initialStateInitializer();
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
      }
      hook.memoizedState = hook.baseState = initialState;
      hook.queue = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: basicStateReducer,
        lastRenderedState: initialState
      };
      return hook;
    }
    function updateOptimisticImpl(hook, current, passthrough, reducer) {
      hook.baseState = passthrough;
      return updateReducerImpl(
        hook,
        currentHook,
        "function" === typeof reducer ? reducer : basicStateReducer
      );
    }
    function dispatchActionState(fiber, actionQueue, setPendingState, setState, payload) {
      if (isRenderPhaseUpdate(fiber)) throw Error(formatProdErrorMessage(485));
      fiber = actionQueue.action;
      if (null !== fiber) {
        var actionNode = {
          payload,
          action: fiber,
          next: null,
          isTransition: true,
          status: "pending",
          value: null,
          reason: null,
          listeners: [],
          then: function(listener) {
            actionNode.listeners.push(listener);
          }
        };
        null !== ReactSharedInternals.T ? setPendingState(true) : actionNode.isTransition = false;
        setState(actionNode);
        setPendingState = actionQueue.pending;
        null === setPendingState ? (actionNode.next = actionQueue.pending = actionNode, runActionStateAction(actionQueue, actionNode)) : (actionNode.next = setPendingState.next, actionQueue.pending = setPendingState.next = actionNode);
      }
    }
    function runActionStateAction(actionQueue, node) {
      var action = node.action, payload = node.payload, prevState = actionQueue.state;
      if (node.isTransition) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = action(prevState, payload), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          handleActionReturnValue(actionQueue, node, returnValue);
        } catch (error) {
          onActionError(actionQueue, node, error);
        } finally {
          null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      } else
        try {
          prevTransition = action(prevState, payload), handleActionReturnValue(actionQueue, node, prevTransition);
        } catch (error$66) {
          onActionError(actionQueue, node, error$66);
        }
    }
    function handleActionReturnValue(actionQueue, node, returnValue) {
      null !== returnValue && "object" === typeof returnValue && "function" === typeof returnValue.then ? returnValue.then(
        function(nextState) {
          onActionSuccess(actionQueue, node, nextState);
        },
        function(error) {
          return onActionError(actionQueue, node, error);
        }
      ) : onActionSuccess(actionQueue, node, returnValue);
    }
    function onActionSuccess(actionQueue, actionNode, nextState) {
      actionNode.status = "fulfilled";
      actionNode.value = nextState;
      notifyActionListeners(actionNode);
      actionQueue.state = nextState;
      actionNode = actionQueue.pending;
      null !== actionNode && (nextState = actionNode.next, nextState === actionNode ? actionQueue.pending = null : (nextState = nextState.next, actionNode.next = nextState, runActionStateAction(actionQueue, nextState)));
    }
    function onActionError(actionQueue, actionNode, error) {
      var last = actionQueue.pending;
      actionQueue.pending = null;
      if (null !== last) {
        last = last.next;
        do
          actionNode.status = "rejected", actionNode.reason = error, notifyActionListeners(actionNode), actionNode = actionNode.next;
        while (actionNode !== last);
      }
      actionQueue.action = null;
    }
    function notifyActionListeners(actionNode) {
      actionNode = actionNode.listeners;
      for (var i = 0; i < actionNode.length; i++) (0, actionNode[i])();
    }
    function actionStateReducer(oldState, newState) {
      return newState;
    }
    function mountActionState(action, initialStateProp) {
      if (isHydrating) {
        var ssrFormState = workInProgressRoot.formState;
        if (null !== ssrFormState) {
          a: {
            var JSCompiler_inline_result = currentlyRenderingFiber;
            if (isHydrating) {
              if (nextHydratableInstance) {
                b: {
                  var JSCompiler_inline_result$jscomp$0 = nextHydratableInstance;
                  for (var inRootOrSingleton = rootOrSingletonContext; 8 !== JSCompiler_inline_result$jscomp$0.nodeType; ) {
                    if (!inRootOrSingleton) {
                      JSCompiler_inline_result$jscomp$0 = null;
                      break b;
                    }
                    JSCompiler_inline_result$jscomp$0 = getNextHydratable(
                      JSCompiler_inline_result$jscomp$0.nextSibling
                    );
                    if (null === JSCompiler_inline_result$jscomp$0) {
                      JSCompiler_inline_result$jscomp$0 = null;
                      break b;
                    }
                  }
                  inRootOrSingleton = JSCompiler_inline_result$jscomp$0.data;
                  JSCompiler_inline_result$jscomp$0 = "F!" === inRootOrSingleton || "F" === inRootOrSingleton ? JSCompiler_inline_result$jscomp$0 : null;
                }
                if (JSCompiler_inline_result$jscomp$0) {
                  nextHydratableInstance = getNextHydratable(
                    JSCompiler_inline_result$jscomp$0.nextSibling
                  );
                  JSCompiler_inline_result = "F!" === JSCompiler_inline_result$jscomp$0.data;
                  break a;
                }
              }
              throwOnHydrationMismatch(JSCompiler_inline_result);
            }
            JSCompiler_inline_result = false;
          }
          JSCompiler_inline_result && (initialStateProp = ssrFormState[0]);
        }
      }
      ssrFormState = mountWorkInProgressHook();
      ssrFormState.memoizedState = ssrFormState.baseState = initialStateProp;
      JSCompiler_inline_result = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: actionStateReducer,
        lastRenderedState: initialStateProp
      };
      ssrFormState.queue = JSCompiler_inline_result;
      ssrFormState = dispatchSetState.bind(
        null,
        currentlyRenderingFiber,
        JSCompiler_inline_result
      );
      JSCompiler_inline_result.dispatch = ssrFormState;
      JSCompiler_inline_result = mountStateImpl(false);
      inRootOrSingleton = dispatchOptimisticSetState.bind(
        null,
        currentlyRenderingFiber,
        false,
        JSCompiler_inline_result.queue
      );
      JSCompiler_inline_result = mountWorkInProgressHook();
      JSCompiler_inline_result$jscomp$0 = {
        state: initialStateProp,
        dispatch: null,
        action,
        pending: null
      };
      JSCompiler_inline_result.queue = JSCompiler_inline_result$jscomp$0;
      ssrFormState = dispatchActionState.bind(
        null,
        currentlyRenderingFiber,
        JSCompiler_inline_result$jscomp$0,
        inRootOrSingleton,
        ssrFormState
      );
      JSCompiler_inline_result$jscomp$0.dispatch = ssrFormState;
      JSCompiler_inline_result.memoizedState = action;
      return [initialStateProp, ssrFormState, false];
    }
    function updateActionState(action) {
      var stateHook = updateWorkInProgressHook();
      return updateActionStateImpl(stateHook, currentHook, action);
    }
    function updateActionStateImpl(stateHook, currentStateHook, action) {
      currentStateHook = updateReducerImpl(
        stateHook,
        currentStateHook,
        actionStateReducer
      )[0];
      stateHook = updateReducer(basicStateReducer)[0];
      if ("object" === typeof currentStateHook && null !== currentStateHook && "function" === typeof currentStateHook.then)
        try {
          var state2 = useThenable(currentStateHook);
        } catch (x2) {
          if (x2 === SuspenseException) throw SuspenseActionException;
          throw x2;
        }
      else state2 = currentStateHook;
      currentStateHook = updateWorkInProgressHook();
      var actionQueue = currentStateHook.queue, dispatch = actionQueue.dispatch;
      action !== currentStateHook.memoizedState && (currentlyRenderingFiber.flags |= 2048, pushSimpleEffect(
        9,
        { destroy: void 0 },
        actionStateActionEffect.bind(null, actionQueue, action),
        null
      ));
      return [state2, dispatch, stateHook];
    }
    function actionStateActionEffect(actionQueue, action) {
      actionQueue.action = action;
    }
    function rerenderActionState(action) {
      var stateHook = updateWorkInProgressHook(), currentStateHook = currentHook;
      if (null !== currentStateHook)
        return updateActionStateImpl(stateHook, currentStateHook, action);
      updateWorkInProgressHook();
      stateHook = stateHook.memoizedState;
      currentStateHook = updateWorkInProgressHook();
      var dispatch = currentStateHook.queue.dispatch;
      currentStateHook.memoizedState = action;
      return [stateHook, dispatch, false];
    }
    function pushSimpleEffect(tag, inst, create, deps) {
      tag = { tag, create, deps, inst, next: null };
      inst = currentlyRenderingFiber.updateQueue;
      null === inst && (inst = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = inst);
      create = inst.lastEffect;
      null === create ? inst.lastEffect = tag.next = tag : (deps = create.next, create.next = tag, tag.next = deps, inst.lastEffect = tag);
      return tag;
    }
    function updateRef() {
      return updateWorkInProgressHook().memoizedState;
    }
    function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
      var hook = mountWorkInProgressHook();
      currentlyRenderingFiber.flags |= fiberFlags;
      hook.memoizedState = pushSimpleEffect(
        1 | hookFlags,
        { destroy: void 0 },
        create,
        void 0 === deps ? null : deps
      );
    }
    function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
      var hook = updateWorkInProgressHook();
      deps = void 0 === deps ? null : deps;
      var inst = hook.memoizedState.inst;
      null !== currentHook && null !== deps && areHookInputsEqual(deps, currentHook.memoizedState.deps) ? hook.memoizedState = pushSimpleEffect(hookFlags, inst, create, deps) : (currentlyRenderingFiber.flags |= fiberFlags, hook.memoizedState = pushSimpleEffect(
        1 | hookFlags,
        inst,
        create,
        deps
      ));
    }
    function mountEffect(create, deps) {
      mountEffectImpl(8390656, 8, create, deps);
    }
    function updateEffect(create, deps) {
      updateEffectImpl(2048, 8, create, deps);
    }
    function useEffectEventImpl(payload) {
      currentlyRenderingFiber.flags |= 4;
      var componentUpdateQueue = currentlyRenderingFiber.updateQueue;
      if (null === componentUpdateQueue)
        componentUpdateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = componentUpdateQueue, componentUpdateQueue.events = [payload];
      else {
        var events = componentUpdateQueue.events;
        null === events ? componentUpdateQueue.events = [payload] : events.push(payload);
      }
    }
    function updateEvent(callback) {
      var ref = updateWorkInProgressHook().memoizedState;
      useEffectEventImpl({ ref, nextImpl: callback });
      return function() {
        if (0 !== (executionContext & 2)) throw Error(formatProdErrorMessage(440));
        return ref.impl.apply(void 0, arguments);
      };
    }
    function updateInsertionEffect(create, deps) {
      return updateEffectImpl(4, 2, create, deps);
    }
    function updateLayoutEffect(create, deps) {
      return updateEffectImpl(4, 4, create, deps);
    }
    function imperativeHandleEffect(create, ref) {
      if ("function" === typeof ref) {
        create = create();
        var refCleanup = ref(create);
        return function() {
          "function" === typeof refCleanup ? refCleanup() : ref(null);
        };
      }
      if (null !== ref && void 0 !== ref)
        return create = create(), ref.current = create, function() {
          ref.current = null;
        };
    }
    function updateImperativeHandle(ref, create, deps) {
      deps = null !== deps && void 0 !== deps ? deps.concat([ref]) : null;
      updateEffectImpl(4, 4, imperativeHandleEffect.bind(null, create, ref), deps);
    }
    function mountDebugValue() {
    }
    function updateCallback(callback, deps) {
      var hook = updateWorkInProgressHook();
      deps = void 0 === deps ? null : deps;
      var prevState = hook.memoizedState;
      if (null !== deps && areHookInputsEqual(deps, prevState[1]))
        return prevState[0];
      hook.memoizedState = [callback, deps];
      return callback;
    }
    function updateMemo(nextCreate, deps) {
      var hook = updateWorkInProgressHook();
      deps = void 0 === deps ? null : deps;
      var prevState = hook.memoizedState;
      if (null !== deps && areHookInputsEqual(deps, prevState[1]))
        return prevState[0];
      prevState = nextCreate();
      if (shouldDoubleInvokeUserFnsInHooksDEV) {
        setIsStrictModeForDevtools(true);
        try {
          nextCreate();
        } finally {
          setIsStrictModeForDevtools(false);
        }
      }
      hook.memoizedState = [prevState, deps];
      return prevState;
    }
    function mountDeferredValueImpl(hook, value, initialValue) {
      if (void 0 === initialValue || 0 !== (renderLanes & 1073741824) && 0 === (workInProgressRootRenderLanes & 261930))
        return hook.memoizedState = value;
      hook.memoizedState = initialValue;
      hook = requestDeferredLane();
      currentlyRenderingFiber.lanes |= hook;
      workInProgressRootSkippedLanes |= hook;
      return initialValue;
    }
    function updateDeferredValueImpl(hook, prevValue, value, initialValue) {
      if (objectIs(value, prevValue)) return value;
      if (null !== currentTreeHiddenStackCursor.current)
        return hook = mountDeferredValueImpl(hook, value, initialValue), objectIs(hook, prevValue) || (didReceiveUpdate = true), hook;
      if (0 === (renderLanes & 42) || 0 !== (renderLanes & 1073741824) && 0 === (workInProgressRootRenderLanes & 261930))
        return didReceiveUpdate = true, hook.memoizedState = value;
      hook = requestDeferredLane();
      currentlyRenderingFiber.lanes |= hook;
      workInProgressRootSkippedLanes |= hook;
      return prevValue;
    }
    function startTransition(fiber, queue, pendingState, finishedState, callback) {
      var previousPriority = ReactDOMSharedInternals.p;
      ReactDOMSharedInternals.p = 0 !== previousPriority && 8 > previousPriority ? previousPriority : 8;
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      ReactSharedInternals.T = currentTransition;
      dispatchOptimisticSetState(fiber, false, queue, pendingState);
      try {
        var returnValue = callback(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        if (null !== returnValue && "object" === typeof returnValue && "function" === typeof returnValue.then) {
          var thenableForFinishedState = chainThenableValue(
            returnValue,
            finishedState
          );
          dispatchSetStateInternal(
            fiber,
            queue,
            thenableForFinishedState,
            requestUpdateLane(fiber)
          );
        } else
          dispatchSetStateInternal(
            fiber,
            queue,
            finishedState,
            requestUpdateLane(fiber)
          );
      } catch (error) {
        dispatchSetStateInternal(
          fiber,
          queue,
          { then: function() {
          }, status: "rejected", reason: error },
          requestUpdateLane()
        );
      } finally {
        ReactDOMSharedInternals.p = previousPriority, null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    }
    function noop() {
    }
    function startHostTransition(formFiber, pendingState, action, formData) {
      if (5 !== formFiber.tag) throw Error(formatProdErrorMessage(476));
      var queue = ensureFormComponentIsStateful(formFiber).queue;
      startTransition(
        formFiber,
        queue,
        pendingState,
        sharedNotPendingObject,
        null === action ? noop : function() {
          requestFormReset$1(formFiber);
          return action(formData);
        }
      );
    }
    function ensureFormComponentIsStateful(formFiber) {
      var existingStateHook = formFiber.memoizedState;
      if (null !== existingStateHook) return existingStateHook;
      existingStateHook = {
        memoizedState: sharedNotPendingObject,
        baseState: sharedNotPendingObject,
        baseQueue: null,
        queue: {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: basicStateReducer,
          lastRenderedState: sharedNotPendingObject
        },
        next: null
      };
      var initialResetState = {};
      existingStateHook.next = {
        memoizedState: initialResetState,
        baseState: initialResetState,
        baseQueue: null,
        queue: {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: basicStateReducer,
          lastRenderedState: initialResetState
        },
        next: null
      };
      formFiber.memoizedState = existingStateHook;
      formFiber = formFiber.alternate;
      null !== formFiber && (formFiber.memoizedState = existingStateHook);
      return existingStateHook;
    }
    function requestFormReset$1(formFiber) {
      var stateHook = ensureFormComponentIsStateful(formFiber);
      null === stateHook.next && (stateHook = formFiber.alternate.memoizedState);
      dispatchSetStateInternal(
        formFiber,
        stateHook.next.queue,
        {},
        requestUpdateLane()
      );
    }
    function useHostTransitionStatus() {
      return readContext(HostTransitionContext);
    }
    function updateId() {
      return updateWorkInProgressHook().memoizedState;
    }
    function updateRefresh() {
      return updateWorkInProgressHook().memoizedState;
    }
    function refreshCache(fiber) {
      for (var provider = fiber.return; null !== provider; ) {
        switch (provider.tag) {
          case 24:
          case 3:
            var lane = requestUpdateLane();
            fiber = createUpdate(lane);
            var root$69 = enqueueUpdate(provider, fiber, lane);
            null !== root$69 && (scheduleUpdateOnFiber(root$69, provider, lane), entangleTransitions(root$69, provider, lane));
            provider = { cache: createCache() };
            fiber.payload = provider;
            return;
        }
        provider = provider.return;
      }
    }
    function dispatchReducerAction(fiber, queue, action) {
      var lane = requestUpdateLane();
      action = {
        lane,
        revertLane: 0,
        gesture: null,
        action,
        hasEagerState: false,
        eagerState: null,
        next: null
      };
      isRenderPhaseUpdate(fiber) ? enqueueRenderPhaseUpdate(queue, action) : (action = enqueueConcurrentHookUpdate(fiber, queue, action, lane), null !== action && (scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane)));
    }
    function dispatchSetState(fiber, queue, action) {
      var lane = requestUpdateLane();
      dispatchSetStateInternal(fiber, queue, action, lane);
    }
    function dispatchSetStateInternal(fiber, queue, action, lane) {
      var update2 = {
        lane,
        revertLane: 0,
        gesture: null,
        action,
        hasEagerState: false,
        eagerState: null,
        next: null
      };
      if (isRenderPhaseUpdate(fiber)) enqueueRenderPhaseUpdate(queue, update2);
      else {
        var alternate = fiber.alternate;
        if (0 === fiber.lanes && (null === alternate || 0 === alternate.lanes) && (alternate = queue.lastRenderedReducer, null !== alternate))
          try {
            var currentState = queue.lastRenderedState, eagerState = alternate(currentState, action);
            update2.hasEagerState = true;
            update2.eagerState = eagerState;
            if (objectIs(eagerState, currentState))
              return enqueueUpdate$1(fiber, queue, update2, 0), null === workInProgressRoot && finishQueueingConcurrentUpdates(), false;
          } catch (error) {
          } finally {
          }
        action = enqueueConcurrentHookUpdate(fiber, queue, update2, lane);
        if (null !== action)
          return scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane), true;
      }
      return false;
    }
    function dispatchOptimisticSetState(fiber, throwIfDuringRender, queue, action) {
      action = {
        lane: 2,
        revertLane: requestTransitionLane(),
        gesture: null,
        action,
        hasEagerState: false,
        eagerState: null,
        next: null
      };
      if (isRenderPhaseUpdate(fiber)) {
        if (throwIfDuringRender) throw Error(formatProdErrorMessage(479));
      } else
        throwIfDuringRender = enqueueConcurrentHookUpdate(
          fiber,
          queue,
          action,
          2
        ), null !== throwIfDuringRender && scheduleUpdateOnFiber(throwIfDuringRender, fiber, 2);
    }
    function isRenderPhaseUpdate(fiber) {
      var alternate = fiber.alternate;
      return fiber === currentlyRenderingFiber || null !== alternate && alternate === currentlyRenderingFiber;
    }
    function enqueueRenderPhaseUpdate(queue, update2) {
      didScheduleRenderPhaseUpdateDuringThisPass = didScheduleRenderPhaseUpdate = true;
      var pending = queue.pending;
      null === pending ? update2.next = update2 : (update2.next = pending.next, pending.next = update2);
      queue.pending = update2;
    }
    function entangleTransitionUpdate(root2, queue, lane) {
      if (0 !== (lane & 4194048)) {
        var queueLanes = queue.lanes;
        queueLanes &= root2.pendingLanes;
        lane |= queueLanes;
        queue.lanes = lane;
        markRootEntangled(root2, lane);
      }
    }
    var ContextOnlyDispatcher = {
      readContext,
      use,
      useCallback: throwInvalidHookError,
      useContext: throwInvalidHookError,
      useEffect: throwInvalidHookError,
      useImperativeHandle: throwInvalidHookError,
      useLayoutEffect: throwInvalidHookError,
      useInsertionEffect: throwInvalidHookError,
      useMemo: throwInvalidHookError,
      useReducer: throwInvalidHookError,
      useRef: throwInvalidHookError,
      useState: throwInvalidHookError,
      useDebugValue: throwInvalidHookError,
      useDeferredValue: throwInvalidHookError,
      useTransition: throwInvalidHookError,
      useSyncExternalStore: throwInvalidHookError,
      useId: throwInvalidHookError,
      useHostTransitionStatus: throwInvalidHookError,
      useFormState: throwInvalidHookError,
      useActionState: throwInvalidHookError,
      useOptimistic: throwInvalidHookError,
      useMemoCache: throwInvalidHookError,
      useCacheRefresh: throwInvalidHookError
    };
    ContextOnlyDispatcher.useEffectEvent = throwInvalidHookError;
    var HooksDispatcherOnMount = {
      readContext,
      use,
      useCallback: function(callback, deps) {
        mountWorkInProgressHook().memoizedState = [
          callback,
          void 0 === deps ? null : deps
        ];
        return callback;
      },
      useContext: readContext,
      useEffect: mountEffect,
      useImperativeHandle: function(ref, create, deps) {
        deps = null !== deps && void 0 !== deps ? deps.concat([ref]) : null;
        mountEffectImpl(
          4194308,
          4,
          imperativeHandleEffect.bind(null, create, ref),
          deps
        );
      },
      useLayoutEffect: function(create, deps) {
        return mountEffectImpl(4194308, 4, create, deps);
      },
      useInsertionEffect: function(create, deps) {
        mountEffectImpl(4, 2, create, deps);
      },
      useMemo: function(nextCreate, deps) {
        var hook = mountWorkInProgressHook();
        deps = void 0 === deps ? null : deps;
        var nextValue = nextCreate();
        if (shouldDoubleInvokeUserFnsInHooksDEV) {
          setIsStrictModeForDevtools(true);
          try {
            nextCreate();
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
        hook.memoizedState = [nextValue, deps];
        return nextValue;
      },
      useReducer: function(reducer, initialArg, init) {
        var hook = mountWorkInProgressHook();
        if (void 0 !== init) {
          var initialState = init(initialArg);
          if (shouldDoubleInvokeUserFnsInHooksDEV) {
            setIsStrictModeForDevtools(true);
            try {
              init(initialArg);
            } finally {
              setIsStrictModeForDevtools(false);
            }
          }
        } else initialState = initialArg;
        hook.memoizedState = hook.baseState = initialState;
        reducer = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: reducer,
          lastRenderedState: initialState
        };
        hook.queue = reducer;
        reducer = reducer.dispatch = dispatchReducerAction.bind(
          null,
          currentlyRenderingFiber,
          reducer
        );
        return [hook.memoizedState, reducer];
      },
      useRef: function(initialValue) {
        var hook = mountWorkInProgressHook();
        initialValue = { current: initialValue };
        return hook.memoizedState = initialValue;
      },
      useState: function(initialState) {
        initialState = mountStateImpl(initialState);
        var queue = initialState.queue, dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
        queue.dispatch = dispatch;
        return [initialState.memoizedState, dispatch];
      },
      useDebugValue: mountDebugValue,
      useDeferredValue: function(value, initialValue) {
        var hook = mountWorkInProgressHook();
        return mountDeferredValueImpl(hook, value, initialValue);
      },
      useTransition: function() {
        var stateHook = mountStateImpl(false);
        stateHook = startTransition.bind(
          null,
          currentlyRenderingFiber,
          stateHook.queue,
          true,
          false
        );
        mountWorkInProgressHook().memoizedState = stateHook;
        return [false, stateHook];
      },
      useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
        var fiber = currentlyRenderingFiber, hook = mountWorkInProgressHook();
        if (isHydrating) {
          if (void 0 === getServerSnapshot)
            throw Error(formatProdErrorMessage(407));
          getServerSnapshot = getServerSnapshot();
        } else {
          getServerSnapshot = getSnapshot();
          if (null === workInProgressRoot)
            throw Error(formatProdErrorMessage(349));
          0 !== (workInProgressRootRenderLanes & 127) || pushStoreConsistencyCheck(fiber, getSnapshot, getServerSnapshot);
        }
        hook.memoizedState = getServerSnapshot;
        var inst = { value: getServerSnapshot, getSnapshot };
        hook.queue = inst;
        mountEffect(subscribeToStore.bind(null, fiber, inst, subscribe), [
          subscribe
        ]);
        fiber.flags |= 2048;
        pushSimpleEffect(
          9,
          { destroy: void 0 },
          updateStoreInstance.bind(
            null,
            fiber,
            inst,
            getServerSnapshot,
            getSnapshot
          ),
          null
        );
        return getServerSnapshot;
      },
      useId: function() {
        var hook = mountWorkInProgressHook(), identifierPrefix = workInProgressRoot.identifierPrefix;
        if (isHydrating) {
          var JSCompiler_inline_result = treeContextOverflow;
          var idWithLeadingBit = treeContextId;
          JSCompiler_inline_result = (idWithLeadingBit & ~(1 << 32 - clz32(idWithLeadingBit) - 1)).toString(32) + JSCompiler_inline_result;
          identifierPrefix = "_" + identifierPrefix + "R_" + JSCompiler_inline_result;
          JSCompiler_inline_result = localIdCounter++;
          0 < JSCompiler_inline_result && (identifierPrefix += "H" + JSCompiler_inline_result.toString(32));
          identifierPrefix += "_";
        } else
          JSCompiler_inline_result = globalClientIdCounter++, identifierPrefix = "_" + identifierPrefix + "r_" + JSCompiler_inline_result.toString(32) + "_";
        return hook.memoizedState = identifierPrefix;
      },
      useHostTransitionStatus,
      useFormState: mountActionState,
      useActionState: mountActionState,
      useOptimistic: function(passthrough) {
        var hook = mountWorkInProgressHook();
        hook.memoizedState = hook.baseState = passthrough;
        var queue = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: null,
          lastRenderedState: null
        };
        hook.queue = queue;
        hook = dispatchOptimisticSetState.bind(
          null,
          currentlyRenderingFiber,
          true,
          queue
        );
        queue.dispatch = hook;
        return [passthrough, hook];
      },
      useMemoCache,
      useCacheRefresh: function() {
        return mountWorkInProgressHook().memoizedState = refreshCache.bind(
          null,
          currentlyRenderingFiber
        );
      },
      useEffectEvent: function(callback) {
        var hook = mountWorkInProgressHook(), ref = { impl: callback };
        hook.memoizedState = ref;
        return function() {
          if (0 !== (executionContext & 2))
            throw Error(formatProdErrorMessage(440));
          return ref.impl.apply(void 0, arguments);
        };
      }
    };
    var HooksDispatcherOnUpdate = {
      readContext,
      use,
      useCallback: updateCallback,
      useContext: readContext,
      useEffect: updateEffect,
      useImperativeHandle: updateImperativeHandle,
      useInsertionEffect: updateInsertionEffect,
      useLayoutEffect: updateLayoutEffect,
      useMemo: updateMemo,
      useReducer: updateReducer,
      useRef: updateRef,
      useState: function() {
        return updateReducer(basicStateReducer);
      },
      useDebugValue: mountDebugValue,
      useDeferredValue: function(value, initialValue) {
        var hook = updateWorkInProgressHook();
        return updateDeferredValueImpl(
          hook,
          currentHook.memoizedState,
          value,
          initialValue
        );
      },
      useTransition: function() {
        var booleanOrThenable = updateReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
        return [
          "boolean" === typeof booleanOrThenable ? booleanOrThenable : useThenable(booleanOrThenable),
          start
        ];
      },
      useSyncExternalStore: updateSyncExternalStore,
      useId: updateId,
      useHostTransitionStatus,
      useFormState: updateActionState,
      useActionState: updateActionState,
      useOptimistic: function(passthrough, reducer) {
        var hook = updateWorkInProgressHook();
        return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
      },
      useMemoCache,
      useCacheRefresh: updateRefresh
    };
    HooksDispatcherOnUpdate.useEffectEvent = updateEvent;
    var HooksDispatcherOnRerender = {
      readContext,
      use,
      useCallback: updateCallback,
      useContext: readContext,
      useEffect: updateEffect,
      useImperativeHandle: updateImperativeHandle,
      useInsertionEffect: updateInsertionEffect,
      useLayoutEffect: updateLayoutEffect,
      useMemo: updateMemo,
      useReducer: rerenderReducer,
      useRef: updateRef,
      useState: function() {
        return rerenderReducer(basicStateReducer);
      },
      useDebugValue: mountDebugValue,
      useDeferredValue: function(value, initialValue) {
        var hook = updateWorkInProgressHook();
        return null === currentHook ? mountDeferredValueImpl(hook, value, initialValue) : updateDeferredValueImpl(
          hook,
          currentHook.memoizedState,
          value,
          initialValue
        );
      },
      useTransition: function() {
        var booleanOrThenable = rerenderReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
        return [
          "boolean" === typeof booleanOrThenable ? booleanOrThenable : useThenable(booleanOrThenable),
          start
        ];
      },
      useSyncExternalStore: updateSyncExternalStore,
      useId: updateId,
      useHostTransitionStatus,
      useFormState: rerenderActionState,
      useActionState: rerenderActionState,
      useOptimistic: function(passthrough, reducer) {
        var hook = updateWorkInProgressHook();
        if (null !== currentHook)
          return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
        hook.baseState = passthrough;
        return [passthrough, hook.queue.dispatch];
      },
      useMemoCache,
      useCacheRefresh: updateRefresh
    };
    HooksDispatcherOnRerender.useEffectEvent = updateEvent;
    function applyDerivedStateFromProps(workInProgress2, ctor, getDerivedStateFromProps, nextProps) {
      ctor = workInProgress2.memoizedState;
      getDerivedStateFromProps = getDerivedStateFromProps(nextProps, ctor);
      getDerivedStateFromProps = null === getDerivedStateFromProps || void 0 === getDerivedStateFromProps ? ctor : assign({}, ctor, getDerivedStateFromProps);
      workInProgress2.memoizedState = getDerivedStateFromProps;
      0 === workInProgress2.lanes && (workInProgress2.updateQueue.baseState = getDerivedStateFromProps);
    }
    var classComponentUpdater = {
      enqueueSetState: function(inst, payload, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(), update2 = createUpdate(lane);
        update2.payload = payload;
        void 0 !== callback && null !== callback && (update2.callback = callback);
        payload = enqueueUpdate(inst, update2, lane);
        null !== payload && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
      },
      enqueueReplaceState: function(inst, payload, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(), update2 = createUpdate(lane);
        update2.tag = 1;
        update2.payload = payload;
        void 0 !== callback && null !== callback && (update2.callback = callback);
        payload = enqueueUpdate(inst, update2, lane);
        null !== payload && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
      },
      enqueueForceUpdate: function(inst, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(), update2 = createUpdate(lane);
        update2.tag = 2;
        void 0 !== callback && null !== callback && (update2.callback = callback);
        callback = enqueueUpdate(inst, update2, lane);
        null !== callback && (scheduleUpdateOnFiber(callback, inst, lane), entangleTransitions(callback, inst, lane));
      }
    };
    function checkShouldComponentUpdate(workInProgress2, ctor, oldProps, newProps, oldState, newState, nextContext) {
      workInProgress2 = workInProgress2.stateNode;
      return "function" === typeof workInProgress2.shouldComponentUpdate ? workInProgress2.shouldComponentUpdate(newProps, newState, nextContext) : ctor.prototype && ctor.prototype.isPureReactComponent ? !shallowEqual(oldProps, newProps) || !shallowEqual(oldState, newState) : true;
    }
    function callComponentWillReceiveProps(workInProgress2, instance, newProps, nextContext) {
      workInProgress2 = instance.state;
      "function" === typeof instance.componentWillReceiveProps && instance.componentWillReceiveProps(newProps, nextContext);
      "function" === typeof instance.UNSAFE_componentWillReceiveProps && instance.UNSAFE_componentWillReceiveProps(newProps, nextContext);
      instance.state !== workInProgress2 && classComponentUpdater.enqueueReplaceState(instance, instance.state, null);
    }
    function resolveClassComponentProps(Component, baseProps) {
      var newProps = baseProps;
      if ("ref" in baseProps) {
        newProps = {};
        for (var propName in baseProps)
          "ref" !== propName && (newProps[propName] = baseProps[propName]);
      }
      if (Component = Component.defaultProps) {
        newProps === baseProps && (newProps = assign({}, newProps));
        for (var propName$73 in Component)
          void 0 === newProps[propName$73] && (newProps[propName$73] = Component[propName$73]);
      }
      return newProps;
    }
    function defaultOnUncaughtError(error) {
      reportGlobalError(error);
    }
    function defaultOnCaughtError(error) {
      console.error(error);
    }
    function defaultOnRecoverableError(error) {
      reportGlobalError(error);
    }
    function logUncaughtError(root2, errorInfo) {
      try {
        var onUncaughtError = root2.onUncaughtError;
        onUncaughtError(errorInfo.value, { componentStack: errorInfo.stack });
      } catch (e$74) {
        setTimeout(function() {
          throw e$74;
        });
      }
    }
    function logCaughtError(root2, boundary, errorInfo) {
      try {
        var onCaughtError = root2.onCaughtError;
        onCaughtError(errorInfo.value, {
          componentStack: errorInfo.stack,
          errorBoundary: 1 === boundary.tag ? boundary.stateNode : null
        });
      } catch (e$75) {
        setTimeout(function() {
          throw e$75;
        });
      }
    }
    function createRootErrorUpdate(root2, errorInfo, lane) {
      lane = createUpdate(lane);
      lane.tag = 3;
      lane.payload = { element: null };
      lane.callback = function() {
        logUncaughtError(root2, errorInfo);
      };
      return lane;
    }
    function createClassErrorUpdate(lane) {
      lane = createUpdate(lane);
      lane.tag = 3;
      return lane;
    }
    function initializeClassErrorUpdate(update2, root2, fiber, errorInfo) {
      var getDerivedStateFromError = fiber.type.getDerivedStateFromError;
      if ("function" === typeof getDerivedStateFromError) {
        var error = errorInfo.value;
        update2.payload = function() {
          return getDerivedStateFromError(error);
        };
        update2.callback = function() {
          logCaughtError(root2, fiber, errorInfo);
        };
      }
      var inst = fiber.stateNode;
      null !== inst && "function" === typeof inst.componentDidCatch && (update2.callback = function() {
        logCaughtError(root2, fiber, errorInfo);
        "function" !== typeof getDerivedStateFromError && (null === legacyErrorBoundariesThatAlreadyFailed ? legacyErrorBoundariesThatAlreadyFailed = /* @__PURE__ */ new Set([this]) : legacyErrorBoundariesThatAlreadyFailed.add(this));
        var stack = errorInfo.stack;
        this.componentDidCatch(errorInfo.value, {
          componentStack: null !== stack ? stack : ""
        });
      });
    }
    function throwException(root2, returnFiber, sourceFiber, value, rootRenderLanes) {
      sourceFiber.flags |= 32768;
      if (null !== value && "object" === typeof value && "function" === typeof value.then) {
        returnFiber = sourceFiber.alternate;
        null !== returnFiber && propagateParentContextChanges(
          returnFiber,
          sourceFiber,
          rootRenderLanes,
          true
        );
        sourceFiber = suspenseHandlerStackCursor.current;
        if (null !== sourceFiber) {
          switch (sourceFiber.tag) {
            case 31:
            case 13:
              return null === shellBoundary ? renderDidSuspendDelayIfPossible() : null === sourceFiber.alternate && 0 === workInProgressRootExitStatus && (workInProgressRootExitStatus = 3), sourceFiber.flags &= -257, sourceFiber.flags |= 65536, sourceFiber.lanes = rootRenderLanes, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, null === returnFiber ? sourceFiber.updateQueue = /* @__PURE__ */ new Set([value]) : returnFiber.add(value), attachPingListener(root2, value, rootRenderLanes)), false;
            case 22:
              return sourceFiber.flags |= 65536, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, null === returnFiber ? (returnFiber = {
                transitions: null,
                markerInstances: null,
                retryQueue: /* @__PURE__ */ new Set([value])
              }, sourceFiber.updateQueue = returnFiber) : (sourceFiber = returnFiber.retryQueue, null === sourceFiber ? returnFiber.retryQueue = /* @__PURE__ */ new Set([value]) : sourceFiber.add(value)), attachPingListener(root2, value, rootRenderLanes)), false;
          }
          throw Error(formatProdErrorMessage(435, sourceFiber.tag));
        }
        attachPingListener(root2, value, rootRenderLanes);
        renderDidSuspendDelayIfPossible();
        return false;
      }
      if (isHydrating)
        return returnFiber = suspenseHandlerStackCursor.current, null !== returnFiber ? (0 === (returnFiber.flags & 65536) && (returnFiber.flags |= 256), returnFiber.flags |= 65536, returnFiber.lanes = rootRenderLanes, value !== HydrationMismatchException && (root2 = Error(formatProdErrorMessage(422), { cause: value }), queueHydrationError(createCapturedValueAtFiber(root2, sourceFiber)))) : (value !== HydrationMismatchException && (returnFiber = Error(formatProdErrorMessage(423), {
          cause: value
        }), queueHydrationError(
          createCapturedValueAtFiber(returnFiber, sourceFiber)
        )), root2 = root2.current.alternate, root2.flags |= 65536, rootRenderLanes &= -rootRenderLanes, root2.lanes |= rootRenderLanes, value = createCapturedValueAtFiber(value, sourceFiber), rootRenderLanes = createRootErrorUpdate(
          root2.stateNode,
          value,
          rootRenderLanes
        ), enqueueCapturedUpdate(root2, rootRenderLanes), 4 !== workInProgressRootExitStatus && (workInProgressRootExitStatus = 2)), false;
      var wrapperError = Error(formatProdErrorMessage(520), { cause: value });
      wrapperError = createCapturedValueAtFiber(wrapperError, sourceFiber);
      null === workInProgressRootConcurrentErrors ? workInProgressRootConcurrentErrors = [wrapperError] : workInProgressRootConcurrentErrors.push(wrapperError);
      4 !== workInProgressRootExitStatus && (workInProgressRootExitStatus = 2);
      if (null === returnFiber) return true;
      value = createCapturedValueAtFiber(value, sourceFiber);
      sourceFiber = returnFiber;
      do {
        switch (sourceFiber.tag) {
          case 3:
            return sourceFiber.flags |= 65536, root2 = rootRenderLanes & -rootRenderLanes, sourceFiber.lanes |= root2, root2 = createRootErrorUpdate(sourceFiber.stateNode, value, root2), enqueueCapturedUpdate(sourceFiber, root2), false;
          case 1:
            if (returnFiber = sourceFiber.type, wrapperError = sourceFiber.stateNode, 0 === (sourceFiber.flags & 128) && ("function" === typeof returnFiber.getDerivedStateFromError || null !== wrapperError && "function" === typeof wrapperError.componentDidCatch && (null === legacyErrorBoundariesThatAlreadyFailed || !legacyErrorBoundariesThatAlreadyFailed.has(wrapperError))))
              return sourceFiber.flags |= 65536, rootRenderLanes &= -rootRenderLanes, sourceFiber.lanes |= rootRenderLanes, rootRenderLanes = createClassErrorUpdate(rootRenderLanes), initializeClassErrorUpdate(
                rootRenderLanes,
                root2,
                sourceFiber,
                value
              ), enqueueCapturedUpdate(sourceFiber, rootRenderLanes), false;
        }
        sourceFiber = sourceFiber.return;
      } while (null !== sourceFiber);
      return false;
    }
    var SelectiveHydrationException = Error(formatProdErrorMessage(461));
    var didReceiveUpdate = false;
    function reconcileChildren(current, workInProgress2, nextChildren, renderLanes2) {
      workInProgress2.child = null === current ? mountChildFibers(workInProgress2, null, nextChildren, renderLanes2) : reconcileChildFibers(
        workInProgress2,
        current.child,
        nextChildren,
        renderLanes2
      );
    }
    function updateForwardRef(current, workInProgress2, Component, nextProps, renderLanes2) {
      Component = Component.render;
      var ref = workInProgress2.ref;
      if ("ref" in nextProps) {
        var propsWithoutRef = {};
        for (var key in nextProps)
          "ref" !== key && (propsWithoutRef[key] = nextProps[key]);
      } else propsWithoutRef = nextProps;
      prepareToReadContext(workInProgress2);
      nextProps = renderWithHooks(
        current,
        workInProgress2,
        Component,
        propsWithoutRef,
        ref,
        renderLanes2
      );
      key = checkDidRenderIdHook();
      if (null !== current && !didReceiveUpdate)
        return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      isHydrating && key && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
      return workInProgress2.child;
    }
    function updateMemoComponent(current, workInProgress2, Component, nextProps, renderLanes2) {
      if (null === current) {
        var type = Component.type;
        if ("function" === typeof type && !shouldConstruct(type) && void 0 === type.defaultProps && null === Component.compare)
          return workInProgress2.tag = 15, workInProgress2.type = type, updateSimpleMemoComponent(
            current,
            workInProgress2,
            type,
            nextProps,
            renderLanes2
          );
        current = createFiberFromTypeAndProps(
          Component.type,
          null,
          nextProps,
          workInProgress2,
          workInProgress2.mode,
          renderLanes2
        );
        current.ref = workInProgress2.ref;
        current.return = workInProgress2;
        return workInProgress2.child = current;
      }
      type = current.child;
      if (!checkScheduledUpdateOrContext(current, renderLanes2)) {
        var prevProps = type.memoizedProps;
        Component = Component.compare;
        Component = null !== Component ? Component : shallowEqual;
        if (Component(prevProps, nextProps) && current.ref === workInProgress2.ref)
          return bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      }
      workInProgress2.flags |= 1;
      current = createWorkInProgress(type, nextProps);
      current.ref = workInProgress2.ref;
      current.return = workInProgress2;
      return workInProgress2.child = current;
    }
    function updateSimpleMemoComponent(current, workInProgress2, Component, nextProps, renderLanes2) {
      if (null !== current) {
        var prevProps = current.memoizedProps;
        if (shallowEqual(prevProps, nextProps) && current.ref === workInProgress2.ref)
          if (didReceiveUpdate = false, workInProgress2.pendingProps = nextProps = prevProps, checkScheduledUpdateOrContext(current, renderLanes2))
            0 !== (current.flags & 131072) && (didReceiveUpdate = true);
          else
            return workInProgress2.lanes = current.lanes, bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      }
      return updateFunctionComponent(
        current,
        workInProgress2,
        Component,
        nextProps,
        renderLanes2
      );
    }
    function updateOffscreenComponent(current, workInProgress2, renderLanes2, nextProps) {
      var nextChildren = nextProps.children, prevState = null !== current ? current.memoizedState : null;
      null === current && null === workInProgress2.stateNode && (workInProgress2.stateNode = {
        _visibility: 1,
        _pendingMarkers: null,
        _retryCache: null,
        _transitions: null
      });
      if ("hidden" === nextProps.mode) {
        if (0 !== (workInProgress2.flags & 128)) {
          prevState = null !== prevState ? prevState.baseLanes | renderLanes2 : renderLanes2;
          if (null !== current) {
            nextProps = workInProgress2.child = current.child;
            for (nextChildren = 0; null !== nextProps; )
              nextChildren = nextChildren | nextProps.lanes | nextProps.childLanes, nextProps = nextProps.sibling;
            nextProps = nextChildren & ~prevState;
          } else nextProps = 0, workInProgress2.child = null;
          return deferHiddenOffscreenComponent(
            current,
            workInProgress2,
            prevState,
            renderLanes2,
            nextProps
          );
        }
        if (0 !== (renderLanes2 & 536870912))
          workInProgress2.memoizedState = { baseLanes: 0, cachePool: null }, null !== current && pushTransition(
            workInProgress2,
            null !== prevState ? prevState.cachePool : null
          ), null !== prevState ? pushHiddenContext(workInProgress2, prevState) : reuseHiddenContextOnStack(), pushOffscreenSuspenseHandler(workInProgress2);
        else
          return nextProps = workInProgress2.lanes = 536870912, deferHiddenOffscreenComponent(
            current,
            workInProgress2,
            null !== prevState ? prevState.baseLanes | renderLanes2 : renderLanes2,
            renderLanes2,
            nextProps
          );
      } else
        null !== prevState ? (pushTransition(workInProgress2, prevState.cachePool), pushHiddenContext(workInProgress2, prevState), reuseSuspenseHandlerOnStack(workInProgress2), workInProgress2.memoizedState = null) : (null !== current && pushTransition(workInProgress2, null), reuseHiddenContextOnStack(), reuseSuspenseHandlerOnStack(workInProgress2));
      reconcileChildren(current, workInProgress2, nextChildren, renderLanes2);
      return workInProgress2.child;
    }
    function bailoutOffscreenComponent(current, workInProgress2) {
      null !== current && 22 === current.tag || null !== workInProgress2.stateNode || (workInProgress2.stateNode = {
        _visibility: 1,
        _pendingMarkers: null,
        _retryCache: null,
        _transitions: null
      });
      return workInProgress2.sibling;
    }
    function deferHiddenOffscreenComponent(current, workInProgress2, nextBaseLanes, renderLanes2, remainingChildLanes) {
      var JSCompiler_inline_result = peekCacheFromPool();
      JSCompiler_inline_result = null === JSCompiler_inline_result ? null : { parent: CacheContext._currentValue, pool: JSCompiler_inline_result };
      workInProgress2.memoizedState = {
        baseLanes: nextBaseLanes,
        cachePool: JSCompiler_inline_result
      };
      null !== current && pushTransition(workInProgress2, null);
      reuseHiddenContextOnStack();
      pushOffscreenSuspenseHandler(workInProgress2);
      null !== current && propagateParentContextChanges(current, workInProgress2, renderLanes2, true);
      workInProgress2.childLanes = remainingChildLanes;
      return null;
    }
    function mountActivityChildren(workInProgress2, nextProps) {
      nextProps = mountWorkInProgressOffscreenFiber(
        { mode: nextProps.mode, children: nextProps.children },
        workInProgress2.mode
      );
      nextProps.ref = workInProgress2.ref;
      workInProgress2.child = nextProps;
      nextProps.return = workInProgress2;
      return nextProps;
    }
    function retryActivityComponentWithoutHydrating(current, workInProgress2, renderLanes2) {
      reconcileChildFibers(workInProgress2, current.child, null, renderLanes2);
      current = mountActivityChildren(workInProgress2, workInProgress2.pendingProps);
      current.flags |= 2;
      popSuspenseHandler(workInProgress2);
      workInProgress2.memoizedState = null;
      return current;
    }
    function updateActivityComponent(current, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, didSuspend = 0 !== (workInProgress2.flags & 128);
      workInProgress2.flags &= -129;
      if (null === current) {
        if (isHydrating) {
          if ("hidden" === nextProps.mode)
            return current = mountActivityChildren(workInProgress2, nextProps), workInProgress2.lanes = 536870912, bailoutOffscreenComponent(null, current);
          pushDehydratedActivitySuspenseHandler(workInProgress2);
          (current = nextHydratableInstance) ? (current = canHydrateHydrationBoundary(
            current,
            rootOrSingletonContext
          ), current = null !== current && "&" === current.data ? current : null, null !== current && (workInProgress2.memoizedState = {
            dehydrated: current,
            treeContext: null !== treeContextProvider ? { id: treeContextId, overflow: treeContextOverflow } : null,
            retryLane: 536870912,
            hydrationErrors: null
          }, renderLanes2 = createFiberFromDehydratedFragment(current), renderLanes2.return = workInProgress2, workInProgress2.child = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null)) : current = null;
          if (null === current) throw throwOnHydrationMismatch(workInProgress2);
          workInProgress2.lanes = 536870912;
          return null;
        }
        return mountActivityChildren(workInProgress2, nextProps);
      }
      var prevState = current.memoizedState;
      if (null !== prevState) {
        var dehydrated = prevState.dehydrated;
        pushDehydratedActivitySuspenseHandler(workInProgress2);
        if (didSuspend)
          if (workInProgress2.flags & 256)
            workInProgress2.flags &= -257, workInProgress2 = retryActivityComponentWithoutHydrating(
              current,
              workInProgress2,
              renderLanes2
            );
          else if (null !== workInProgress2.memoizedState)
            workInProgress2.child = current.child, workInProgress2.flags |= 128, workInProgress2 = null;
          else throw Error(formatProdErrorMessage(558));
        else if (didReceiveUpdate || propagateParentContextChanges(current, workInProgress2, renderLanes2, false), didSuspend = 0 !== (renderLanes2 & current.childLanes), didReceiveUpdate || didSuspend) {
          nextProps = workInProgressRoot;
          if (null !== nextProps && (dehydrated = getBumpedLaneForHydration(nextProps, renderLanes2), 0 !== dehydrated && dehydrated !== prevState.retryLane))
            throw prevState.retryLane = dehydrated, enqueueConcurrentRenderForLane(current, dehydrated), scheduleUpdateOnFiber(nextProps, current, dehydrated), SelectiveHydrationException;
          renderDidSuspendDelayIfPossible();
          workInProgress2 = retryActivityComponentWithoutHydrating(
            current,
            workInProgress2,
            renderLanes2
          );
        } else
          current = prevState.treeContext, nextHydratableInstance = getNextHydratable(dehydrated.nextSibling), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = false, null !== current && restoreSuspendedTreeContext(workInProgress2, current), workInProgress2 = mountActivityChildren(workInProgress2, nextProps), workInProgress2.flags |= 4096;
        return workInProgress2;
      }
      current = createWorkInProgress(current.child, {
        mode: nextProps.mode,
        children: nextProps.children
      });
      current.ref = workInProgress2.ref;
      workInProgress2.child = current;
      current.return = workInProgress2;
      return current;
    }
    function markRef(current, workInProgress2) {
      var ref = workInProgress2.ref;
      if (null === ref)
        null !== current && null !== current.ref && (workInProgress2.flags |= 4194816);
      else {
        if ("function" !== typeof ref && "object" !== typeof ref)
          throw Error(formatProdErrorMessage(284));
        if (null === current || current.ref !== ref)
          workInProgress2.flags |= 4194816;
      }
    }
    function updateFunctionComponent(current, workInProgress2, Component, nextProps, renderLanes2) {
      prepareToReadContext(workInProgress2);
      Component = renderWithHooks(
        current,
        workInProgress2,
        Component,
        nextProps,
        void 0,
        renderLanes2
      );
      nextProps = checkDidRenderIdHook();
      if (null !== current && !didReceiveUpdate)
        return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      isHydrating && nextProps && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current, workInProgress2, Component, renderLanes2);
      return workInProgress2.child;
    }
    function replayFunctionComponent(current, workInProgress2, nextProps, Component, secondArg, renderLanes2) {
      prepareToReadContext(workInProgress2);
      workInProgress2.updateQueue = null;
      nextProps = renderWithHooksAgain(
        workInProgress2,
        Component,
        nextProps,
        secondArg
      );
      finishRenderingHooks(current);
      Component = checkDidRenderIdHook();
      if (null !== current && !didReceiveUpdate)
        return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      isHydrating && Component && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
      return workInProgress2.child;
    }
    function updateClassComponent(current, workInProgress2, Component, nextProps, renderLanes2) {
      prepareToReadContext(workInProgress2);
      if (null === workInProgress2.stateNode) {
        var context = emptyContextObject, contextType = Component.contextType;
        "object" === typeof contextType && null !== contextType && (context = readContext(contextType));
        context = new Component(nextProps, context);
        workInProgress2.memoizedState = null !== context.state && void 0 !== context.state ? context.state : null;
        context.updater = classComponentUpdater;
        workInProgress2.stateNode = context;
        context._reactInternals = workInProgress2;
        context = workInProgress2.stateNode;
        context.props = nextProps;
        context.state = workInProgress2.memoizedState;
        context.refs = {};
        initializeUpdateQueue(workInProgress2);
        contextType = Component.contextType;
        context.context = "object" === typeof contextType && null !== contextType ? readContext(contextType) : emptyContextObject;
        context.state = workInProgress2.memoizedState;
        contextType = Component.getDerivedStateFromProps;
        "function" === typeof contextType && (applyDerivedStateFromProps(
          workInProgress2,
          Component,
          contextType,
          nextProps
        ), context.state = workInProgress2.memoizedState);
        "function" === typeof Component.getDerivedStateFromProps || "function" === typeof context.getSnapshotBeforeUpdate || "function" !== typeof context.UNSAFE_componentWillMount && "function" !== typeof context.componentWillMount || (contextType = context.state, "function" === typeof context.componentWillMount && context.componentWillMount(), "function" === typeof context.UNSAFE_componentWillMount && context.UNSAFE_componentWillMount(), contextType !== context.state && classComponentUpdater.enqueueReplaceState(context, context.state, null), processUpdateQueue(workInProgress2, nextProps, context, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction(), context.state = workInProgress2.memoizedState);
        "function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308);
        nextProps = true;
      } else if (null === current) {
        context = workInProgress2.stateNode;
        var unresolvedOldProps = workInProgress2.memoizedProps, oldProps = resolveClassComponentProps(Component, unresolvedOldProps);
        context.props = oldProps;
        var oldContext = context.context, contextType$jscomp$0 = Component.contextType;
        contextType = emptyContextObject;
        "object" === typeof contextType$jscomp$0 && null !== contextType$jscomp$0 && (contextType = readContext(contextType$jscomp$0));
        var getDerivedStateFromProps = Component.getDerivedStateFromProps;
        contextType$jscomp$0 = "function" === typeof getDerivedStateFromProps || "function" === typeof context.getSnapshotBeforeUpdate;
        unresolvedOldProps = workInProgress2.pendingProps !== unresolvedOldProps;
        contextType$jscomp$0 || "function" !== typeof context.UNSAFE_componentWillReceiveProps && "function" !== typeof context.componentWillReceiveProps || (unresolvedOldProps || oldContext !== contextType) && callComponentWillReceiveProps(
          workInProgress2,
          context,
          nextProps,
          contextType
        );
        hasForceUpdate = false;
        var oldState = workInProgress2.memoizedState;
        context.state = oldState;
        processUpdateQueue(workInProgress2, nextProps, context, renderLanes2);
        suspendIfUpdateReadFromEntangledAsyncAction();
        oldContext = workInProgress2.memoizedState;
        unresolvedOldProps || oldState !== oldContext || hasForceUpdate ? ("function" === typeof getDerivedStateFromProps && (applyDerivedStateFromProps(
          workInProgress2,
          Component,
          getDerivedStateFromProps,
          nextProps
        ), oldContext = workInProgress2.memoizedState), (oldProps = hasForceUpdate || checkShouldComponentUpdate(
          workInProgress2,
          Component,
          oldProps,
          nextProps,
          oldState,
          oldContext,
          contextType
        )) ? (contextType$jscomp$0 || "function" !== typeof context.UNSAFE_componentWillMount && "function" !== typeof context.componentWillMount || ("function" === typeof context.componentWillMount && context.componentWillMount(), "function" === typeof context.UNSAFE_componentWillMount && context.UNSAFE_componentWillMount()), "function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308)) : ("function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = oldContext), context.props = nextProps, context.state = oldContext, context.context = contextType, nextProps = oldProps) : ("function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308), nextProps = false);
      } else {
        context = workInProgress2.stateNode;
        cloneUpdateQueue(current, workInProgress2);
        contextType = workInProgress2.memoizedProps;
        contextType$jscomp$0 = resolveClassComponentProps(Component, contextType);
        context.props = contextType$jscomp$0;
        getDerivedStateFromProps = workInProgress2.pendingProps;
        oldState = context.context;
        oldContext = Component.contextType;
        oldProps = emptyContextObject;
        "object" === typeof oldContext && null !== oldContext && (oldProps = readContext(oldContext));
        unresolvedOldProps = Component.getDerivedStateFromProps;
        (oldContext = "function" === typeof unresolvedOldProps || "function" === typeof context.getSnapshotBeforeUpdate) || "function" !== typeof context.UNSAFE_componentWillReceiveProps && "function" !== typeof context.componentWillReceiveProps || (contextType !== getDerivedStateFromProps || oldState !== oldProps) && callComponentWillReceiveProps(
          workInProgress2,
          context,
          nextProps,
          oldProps
        );
        hasForceUpdate = false;
        oldState = workInProgress2.memoizedState;
        context.state = oldState;
        processUpdateQueue(workInProgress2, nextProps, context, renderLanes2);
        suspendIfUpdateReadFromEntangledAsyncAction();
        var newState = workInProgress2.memoizedState;
        contextType !== getDerivedStateFromProps || oldState !== newState || hasForceUpdate || null !== current && null !== current.dependencies && checkIfContextChanged(current.dependencies) ? ("function" === typeof unresolvedOldProps && (applyDerivedStateFromProps(
          workInProgress2,
          Component,
          unresolvedOldProps,
          nextProps
        ), newState = workInProgress2.memoizedState), (contextType$jscomp$0 = hasForceUpdate || checkShouldComponentUpdate(
          workInProgress2,
          Component,
          contextType$jscomp$0,
          nextProps,
          oldState,
          newState,
          oldProps
        ) || null !== current && null !== current.dependencies && checkIfContextChanged(current.dependencies)) ? (oldContext || "function" !== typeof context.UNSAFE_componentWillUpdate && "function" !== typeof context.componentWillUpdate || ("function" === typeof context.componentWillUpdate && context.componentWillUpdate(nextProps, newState, oldProps), "function" === typeof context.UNSAFE_componentWillUpdate && context.UNSAFE_componentWillUpdate(
          nextProps,
          newState,
          oldProps
        )), "function" === typeof context.componentDidUpdate && (workInProgress2.flags |= 4), "function" === typeof context.getSnapshotBeforeUpdate && (workInProgress2.flags |= 1024)) : ("function" !== typeof context.componentDidUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 4), "function" !== typeof context.getSnapshotBeforeUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 1024), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = newState), context.props = nextProps, context.state = newState, context.context = oldProps, nextProps = contextType$jscomp$0) : ("function" !== typeof context.componentDidUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 4), "function" !== typeof context.getSnapshotBeforeUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 1024), nextProps = false);
      }
      context = nextProps;
      markRef(current, workInProgress2);
      nextProps = 0 !== (workInProgress2.flags & 128);
      context || nextProps ? (context = workInProgress2.stateNode, Component = nextProps && "function" !== typeof Component.getDerivedStateFromError ? null : context.render(), workInProgress2.flags |= 1, null !== current && nextProps ? (workInProgress2.child = reconcileChildFibers(
        workInProgress2,
        current.child,
        null,
        renderLanes2
      ), workInProgress2.child = reconcileChildFibers(
        workInProgress2,
        null,
        Component,
        renderLanes2
      )) : reconcileChildren(current, workInProgress2, Component, renderLanes2), workInProgress2.memoizedState = context.state, current = workInProgress2.child) : current = bailoutOnAlreadyFinishedWork(
        current,
        workInProgress2,
        renderLanes2
      );
      return current;
    }
    function mountHostRootWithoutHydrating(current, workInProgress2, nextChildren, renderLanes2) {
      resetHydrationState();
      workInProgress2.flags |= 256;
      reconcileChildren(current, workInProgress2, nextChildren, renderLanes2);
      return workInProgress2.child;
    }
    var SUSPENDED_MARKER = {
      dehydrated: null,
      treeContext: null,
      retryLane: 0,
      hydrationErrors: null
    };
    function mountSuspenseOffscreenState(renderLanes2) {
      return { baseLanes: renderLanes2, cachePool: getSuspendedCache() };
    }
    function getRemainingWorkInPrimaryTree(current, primaryTreeDidDefer, renderLanes2) {
      current = null !== current ? current.childLanes & ~renderLanes2 : 0;
      primaryTreeDidDefer && (current |= workInProgressDeferredLane);
      return current;
    }
    function updateSuspenseComponent(current, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, showFallback = false, didSuspend = 0 !== (workInProgress2.flags & 128), JSCompiler_temp;
      (JSCompiler_temp = didSuspend) || (JSCompiler_temp = null !== current && null === current.memoizedState ? false : 0 !== (suspenseStackCursor.current & 2));
      JSCompiler_temp && (showFallback = true, workInProgress2.flags &= -129);
      JSCompiler_temp = 0 !== (workInProgress2.flags & 32);
      workInProgress2.flags &= -33;
      if (null === current) {
        if (isHydrating) {
          showFallback ? pushPrimaryTreeSuspenseHandler(workInProgress2) : reuseSuspenseHandlerOnStack(workInProgress2);
          (current = nextHydratableInstance) ? (current = canHydrateHydrationBoundary(
            current,
            rootOrSingletonContext
          ), current = null !== current && "&" !== current.data ? current : null, null !== current && (workInProgress2.memoizedState = {
            dehydrated: current,
            treeContext: null !== treeContextProvider ? { id: treeContextId, overflow: treeContextOverflow } : null,
            retryLane: 536870912,
            hydrationErrors: null
          }, renderLanes2 = createFiberFromDehydratedFragment(current), renderLanes2.return = workInProgress2, workInProgress2.child = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null)) : current = null;
          if (null === current) throw throwOnHydrationMismatch(workInProgress2);
          isSuspenseInstanceFallback(current) ? workInProgress2.lanes = 32 : workInProgress2.lanes = 536870912;
          return null;
        }
        var nextPrimaryChildren = nextProps.children;
        nextProps = nextProps.fallback;
        if (showFallback)
          return reuseSuspenseHandlerOnStack(workInProgress2), showFallback = workInProgress2.mode, nextPrimaryChildren = mountWorkInProgressOffscreenFiber(
            { mode: "hidden", children: nextPrimaryChildren },
            showFallback
          ), nextProps = createFiberFromFragment(
            nextProps,
            showFallback,
            renderLanes2,
            null
          ), nextPrimaryChildren.return = workInProgress2, nextProps.return = workInProgress2, nextPrimaryChildren.sibling = nextProps, workInProgress2.child = nextPrimaryChildren, nextProps = workInProgress2.child, nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2), nextProps.childLanes = getRemainingWorkInPrimaryTree(
            current,
            JSCompiler_temp,
            renderLanes2
          ), workInProgress2.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(null, nextProps);
        pushPrimaryTreeSuspenseHandler(workInProgress2);
        return mountSuspensePrimaryChildren(workInProgress2, nextPrimaryChildren);
      }
      var prevState = current.memoizedState;
      if (null !== prevState && (nextPrimaryChildren = prevState.dehydrated, null !== nextPrimaryChildren)) {
        if (didSuspend)
          workInProgress2.flags & 256 ? (pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags &= -257, workInProgress2 = retrySuspenseComponentWithoutHydrating(
            current,
            workInProgress2,
            renderLanes2
          )) : null !== workInProgress2.memoizedState ? (reuseSuspenseHandlerOnStack(workInProgress2), workInProgress2.child = current.child, workInProgress2.flags |= 128, workInProgress2 = null) : (reuseSuspenseHandlerOnStack(workInProgress2), nextPrimaryChildren = nextProps.fallback, showFallback = workInProgress2.mode, nextProps = mountWorkInProgressOffscreenFiber(
            { mode: "visible", children: nextProps.children },
            showFallback
          ), nextPrimaryChildren = createFiberFromFragment(
            nextPrimaryChildren,
            showFallback,
            renderLanes2,
            null
          ), nextPrimaryChildren.flags |= 2, nextProps.return = workInProgress2, nextPrimaryChildren.return = workInProgress2, nextProps.sibling = nextPrimaryChildren, workInProgress2.child = nextProps, reconcileChildFibers(
            workInProgress2,
            current.child,
            null,
            renderLanes2
          ), nextProps = workInProgress2.child, nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2), nextProps.childLanes = getRemainingWorkInPrimaryTree(
            current,
            JSCompiler_temp,
            renderLanes2
          ), workInProgress2.memoizedState = SUSPENDED_MARKER, workInProgress2 = bailoutOffscreenComponent(null, nextProps));
        else if (pushPrimaryTreeSuspenseHandler(workInProgress2), isSuspenseInstanceFallback(nextPrimaryChildren)) {
          JSCompiler_temp = nextPrimaryChildren.nextSibling && nextPrimaryChildren.nextSibling.dataset;
          if (JSCompiler_temp) var digest = JSCompiler_temp.dgst;
          JSCompiler_temp = digest;
          nextProps = Error(formatProdErrorMessage(419));
          nextProps.stack = "";
          nextProps.digest = JSCompiler_temp;
          queueHydrationError({ value: nextProps, source: null, stack: null });
          workInProgress2 = retrySuspenseComponentWithoutHydrating(
            current,
            workInProgress2,
            renderLanes2
          );
        } else if (didReceiveUpdate || propagateParentContextChanges(current, workInProgress2, renderLanes2, false), JSCompiler_temp = 0 !== (renderLanes2 & current.childLanes), didReceiveUpdate || JSCompiler_temp) {
          JSCompiler_temp = workInProgressRoot;
          if (null !== JSCompiler_temp && (nextProps = getBumpedLaneForHydration(JSCompiler_temp, renderLanes2), 0 !== nextProps && nextProps !== prevState.retryLane))
            throw prevState.retryLane = nextProps, enqueueConcurrentRenderForLane(current, nextProps), scheduleUpdateOnFiber(JSCompiler_temp, current, nextProps), SelectiveHydrationException;
          isSuspenseInstancePending(nextPrimaryChildren) || renderDidSuspendDelayIfPossible();
          workInProgress2 = retrySuspenseComponentWithoutHydrating(
            current,
            workInProgress2,
            renderLanes2
          );
        } else
          isSuspenseInstancePending(nextPrimaryChildren) ? (workInProgress2.flags |= 192, workInProgress2.child = current.child, workInProgress2 = null) : (current = prevState.treeContext, nextHydratableInstance = getNextHydratable(
            nextPrimaryChildren.nextSibling
          ), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = false, null !== current && restoreSuspendedTreeContext(workInProgress2, current), workInProgress2 = mountSuspensePrimaryChildren(
            workInProgress2,
            nextProps.children
          ), workInProgress2.flags |= 4096);
        return workInProgress2;
      }
      if (showFallback)
        return reuseSuspenseHandlerOnStack(workInProgress2), nextPrimaryChildren = nextProps.fallback, showFallback = workInProgress2.mode, prevState = current.child, digest = prevState.sibling, nextProps = createWorkInProgress(prevState, {
          mode: "hidden",
          children: nextProps.children
        }), nextProps.subtreeFlags = prevState.subtreeFlags & 65011712, null !== digest ? nextPrimaryChildren = createWorkInProgress(
          digest,
          nextPrimaryChildren
        ) : (nextPrimaryChildren = createFiberFromFragment(
          nextPrimaryChildren,
          showFallback,
          renderLanes2,
          null
        ), nextPrimaryChildren.flags |= 2), nextPrimaryChildren.return = workInProgress2, nextProps.return = workInProgress2, nextProps.sibling = nextPrimaryChildren, workInProgress2.child = nextProps, bailoutOffscreenComponent(null, nextProps), nextProps = workInProgress2.child, nextPrimaryChildren = current.child.memoizedState, null === nextPrimaryChildren ? nextPrimaryChildren = mountSuspenseOffscreenState(renderLanes2) : (showFallback = nextPrimaryChildren.cachePool, null !== showFallback ? (prevState = CacheContext._currentValue, showFallback = showFallback.parent !== prevState ? { parent: prevState, pool: prevState } : showFallback) : showFallback = getSuspendedCache(), nextPrimaryChildren = {
          baseLanes: nextPrimaryChildren.baseLanes | renderLanes2,
          cachePool: showFallback
        }), nextProps.memoizedState = nextPrimaryChildren, nextProps.childLanes = getRemainingWorkInPrimaryTree(
          current,
          JSCompiler_temp,
          renderLanes2
        ), workInProgress2.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(current.child, nextProps);
      pushPrimaryTreeSuspenseHandler(workInProgress2);
      renderLanes2 = current.child;
      current = renderLanes2.sibling;
      renderLanes2 = createWorkInProgress(renderLanes2, {
        mode: "visible",
        children: nextProps.children
      });
      renderLanes2.return = workInProgress2;
      renderLanes2.sibling = null;
      null !== current && (JSCompiler_temp = workInProgress2.deletions, null === JSCompiler_temp ? (workInProgress2.deletions = [current], workInProgress2.flags |= 16) : JSCompiler_temp.push(current));
      workInProgress2.child = renderLanes2;
      workInProgress2.memoizedState = null;
      return renderLanes2;
    }
    function mountSuspensePrimaryChildren(workInProgress2, primaryChildren) {
      primaryChildren = mountWorkInProgressOffscreenFiber(
        { mode: "visible", children: primaryChildren },
        workInProgress2.mode
      );
      primaryChildren.return = workInProgress2;
      return workInProgress2.child = primaryChildren;
    }
    function mountWorkInProgressOffscreenFiber(offscreenProps, mode) {
      offscreenProps = createFiberImplClass(22, offscreenProps, null, mode);
      offscreenProps.lanes = 0;
      return offscreenProps;
    }
    function retrySuspenseComponentWithoutHydrating(current, workInProgress2, renderLanes2) {
      reconcileChildFibers(workInProgress2, current.child, null, renderLanes2);
      current = mountSuspensePrimaryChildren(
        workInProgress2,
        workInProgress2.pendingProps.children
      );
      current.flags |= 2;
      workInProgress2.memoizedState = null;
      return current;
    }
    function scheduleSuspenseWorkOnFiber(fiber, renderLanes2, propagationRoot) {
      fiber.lanes |= renderLanes2;
      var alternate = fiber.alternate;
      null !== alternate && (alternate.lanes |= renderLanes2);
      scheduleContextWorkOnParentPath(fiber.return, renderLanes2, propagationRoot);
    }
    function initSuspenseListRenderState(workInProgress2, isBackwards, tail, lastContentRow, tailMode, treeForkCount2) {
      var renderState = workInProgress2.memoizedState;
      null === renderState ? workInProgress2.memoizedState = {
        isBackwards,
        rendering: null,
        renderingStartTime: 0,
        last: lastContentRow,
        tail,
        tailMode,
        treeForkCount: treeForkCount2
      } : (renderState.isBackwards = isBackwards, renderState.rendering = null, renderState.renderingStartTime = 0, renderState.last = lastContentRow, renderState.tail = tail, renderState.tailMode = tailMode, renderState.treeForkCount = treeForkCount2);
    }
    function updateSuspenseListComponent(current, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, revealOrder = nextProps.revealOrder, tailMode = nextProps.tail;
      nextProps = nextProps.children;
      var suspenseContext = suspenseStackCursor.current, shouldForceFallback = 0 !== (suspenseContext & 2);
      shouldForceFallback ? (suspenseContext = suspenseContext & 1 | 2, workInProgress2.flags |= 128) : suspenseContext &= 1;
      push(suspenseStackCursor, suspenseContext);
      reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
      nextProps = isHydrating ? treeForkCount : 0;
      if (!shouldForceFallback && null !== current && 0 !== (current.flags & 128))
        a: for (current = workInProgress2.child; null !== current; ) {
          if (13 === current.tag)
            null !== current.memoizedState && scheduleSuspenseWorkOnFiber(current, renderLanes2, workInProgress2);
          else if (19 === current.tag)
            scheduleSuspenseWorkOnFiber(current, renderLanes2, workInProgress2);
          else if (null !== current.child) {
            current.child.return = current;
            current = current.child;
            continue;
          }
          if (current === workInProgress2) break a;
          for (; null === current.sibling; ) {
            if (null === current.return || current.return === workInProgress2)
              break a;
            current = current.return;
          }
          current.sibling.return = current.return;
          current = current.sibling;
        }
      switch (revealOrder) {
        case "forwards":
          renderLanes2 = workInProgress2.child;
          for (revealOrder = null; null !== renderLanes2; )
            current = renderLanes2.alternate, null !== current && null === findFirstSuspended(current) && (revealOrder = renderLanes2), renderLanes2 = renderLanes2.sibling;
          renderLanes2 = revealOrder;
          null === renderLanes2 ? (revealOrder = workInProgress2.child, workInProgress2.child = null) : (revealOrder = renderLanes2.sibling, renderLanes2.sibling = null);
          initSuspenseListRenderState(
            workInProgress2,
            false,
            revealOrder,
            renderLanes2,
            tailMode,
            nextProps
          );
          break;
        case "backwards":
        case "unstable_legacy-backwards":
          renderLanes2 = null;
          revealOrder = workInProgress2.child;
          for (workInProgress2.child = null; null !== revealOrder; ) {
            current = revealOrder.alternate;
            if (null !== current && null === findFirstSuspended(current)) {
              workInProgress2.child = revealOrder;
              break;
            }
            current = revealOrder.sibling;
            revealOrder.sibling = renderLanes2;
            renderLanes2 = revealOrder;
            revealOrder = current;
          }
          initSuspenseListRenderState(
            workInProgress2,
            true,
            renderLanes2,
            null,
            tailMode,
            nextProps
          );
          break;
        case "together":
          initSuspenseListRenderState(
            workInProgress2,
            false,
            null,
            null,
            void 0,
            nextProps
          );
          break;
        default:
          workInProgress2.memoizedState = null;
      }
      return workInProgress2.child;
    }
    function bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2) {
      null !== current && (workInProgress2.dependencies = current.dependencies);
      workInProgressRootSkippedLanes |= workInProgress2.lanes;
      if (0 === (renderLanes2 & workInProgress2.childLanes))
        if (null !== current) {
          if (propagateParentContextChanges(
            current,
            workInProgress2,
            renderLanes2,
            false
          ), 0 === (renderLanes2 & workInProgress2.childLanes))
            return null;
        } else return null;
      if (null !== current && workInProgress2.child !== current.child)
        throw Error(formatProdErrorMessage(153));
      if (null !== workInProgress2.child) {
        current = workInProgress2.child;
        renderLanes2 = createWorkInProgress(current, current.pendingProps);
        workInProgress2.child = renderLanes2;
        for (renderLanes2.return = workInProgress2; null !== current.sibling; )
          current = current.sibling, renderLanes2 = renderLanes2.sibling = createWorkInProgress(current, current.pendingProps), renderLanes2.return = workInProgress2;
        renderLanes2.sibling = null;
      }
      return workInProgress2.child;
    }
    function checkScheduledUpdateOrContext(current, renderLanes2) {
      if (0 !== (current.lanes & renderLanes2)) return true;
      current = current.dependencies;
      return null !== current && checkIfContextChanged(current) ? true : false;
    }
    function attemptEarlyBailoutIfNoScheduledUpdate(current, workInProgress2, renderLanes2) {
      switch (workInProgress2.tag) {
        case 3:
          pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
          pushProvider(workInProgress2, CacheContext, current.memoizedState.cache);
          resetHydrationState();
          break;
        case 27:
        case 5:
          pushHostContext(workInProgress2);
          break;
        case 4:
          pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
          break;
        case 10:
          pushProvider(
            workInProgress2,
            workInProgress2.type,
            workInProgress2.memoizedProps.value
          );
          break;
        case 31:
          if (null !== workInProgress2.memoizedState)
            return workInProgress2.flags |= 128, pushDehydratedActivitySuspenseHandler(workInProgress2), null;
          break;
        case 13:
          var state$102 = workInProgress2.memoizedState;
          if (null !== state$102) {
            if (null !== state$102.dehydrated)
              return pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags |= 128, null;
            if (0 !== (renderLanes2 & workInProgress2.child.childLanes))
              return updateSuspenseComponent(current, workInProgress2, renderLanes2);
            pushPrimaryTreeSuspenseHandler(workInProgress2);
            current = bailoutOnAlreadyFinishedWork(
              current,
              workInProgress2,
              renderLanes2
            );
            return null !== current ? current.sibling : null;
          }
          pushPrimaryTreeSuspenseHandler(workInProgress2);
          break;
        case 19:
          var didSuspendBefore = 0 !== (current.flags & 128);
          state$102 = 0 !== (renderLanes2 & workInProgress2.childLanes);
          state$102 || (propagateParentContextChanges(
            current,
            workInProgress2,
            renderLanes2,
            false
          ), state$102 = 0 !== (renderLanes2 & workInProgress2.childLanes));
          if (didSuspendBefore) {
            if (state$102)
              return updateSuspenseListComponent(
                current,
                workInProgress2,
                renderLanes2
              );
            workInProgress2.flags |= 128;
          }
          didSuspendBefore = workInProgress2.memoizedState;
          null !== didSuspendBefore && (didSuspendBefore.rendering = null, didSuspendBefore.tail = null, didSuspendBefore.lastEffect = null);
          push(suspenseStackCursor, suspenseStackCursor.current);
          if (state$102) break;
          else return null;
        case 22:
          return workInProgress2.lanes = 0, updateOffscreenComponent(
            current,
            workInProgress2,
            renderLanes2,
            workInProgress2.pendingProps
          );
        case 24:
          pushProvider(workInProgress2, CacheContext, current.memoizedState.cache);
      }
      return bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
    }
    function beginWork(current, workInProgress2, renderLanes2) {
      if (null !== current)
        if (current.memoizedProps !== workInProgress2.pendingProps)
          didReceiveUpdate = true;
        else {
          if (!checkScheduledUpdateOrContext(current, renderLanes2) && 0 === (workInProgress2.flags & 128))
            return didReceiveUpdate = false, attemptEarlyBailoutIfNoScheduledUpdate(
              current,
              workInProgress2,
              renderLanes2
            );
          didReceiveUpdate = 0 !== (current.flags & 131072) ? true : false;
        }
      else
        didReceiveUpdate = false, isHydrating && 0 !== (workInProgress2.flags & 1048576) && pushTreeId(workInProgress2, treeForkCount, workInProgress2.index);
      workInProgress2.lanes = 0;
      switch (workInProgress2.tag) {
        case 16:
          a: {
            var props = workInProgress2.pendingProps;
            current = resolveLazy(workInProgress2.elementType);
            workInProgress2.type = current;
            if ("function" === typeof current)
              shouldConstruct(current) ? (props = resolveClassComponentProps(current, props), workInProgress2.tag = 1, workInProgress2 = updateClassComponent(
                null,
                workInProgress2,
                current,
                props,
                renderLanes2
              )) : (workInProgress2.tag = 0, workInProgress2 = updateFunctionComponent(
                null,
                workInProgress2,
                current,
                props,
                renderLanes2
              ));
            else {
              if (void 0 !== current && null !== current) {
                var $$typeof = current.$$typeof;
                if ($$typeof === REACT_FORWARD_REF_TYPE) {
                  workInProgress2.tag = 11;
                  workInProgress2 = updateForwardRef(
                    null,
                    workInProgress2,
                    current,
                    props,
                    renderLanes2
                  );
                  break a;
                } else if ($$typeof === REACT_MEMO_TYPE) {
                  workInProgress2.tag = 14;
                  workInProgress2 = updateMemoComponent(
                    null,
                    workInProgress2,
                    current,
                    props,
                    renderLanes2
                  );
                  break a;
                }
              }
              workInProgress2 = getComponentNameFromType(current) || current;
              throw Error(formatProdErrorMessage(306, workInProgress2, ""));
            }
          }
          return workInProgress2;
        case 0:
          return updateFunctionComponent(
            current,
            workInProgress2,
            workInProgress2.type,
            workInProgress2.pendingProps,
            renderLanes2
          );
        case 1:
          return props = workInProgress2.type, $$typeof = resolveClassComponentProps(
            props,
            workInProgress2.pendingProps
          ), updateClassComponent(
            current,
            workInProgress2,
            props,
            $$typeof,
            renderLanes2
          );
        case 3:
          a: {
            pushHostContainer(
              workInProgress2,
              workInProgress2.stateNode.containerInfo
            );
            if (null === current) throw Error(formatProdErrorMessage(387));
            props = workInProgress2.pendingProps;
            var prevState = workInProgress2.memoizedState;
            $$typeof = prevState.element;
            cloneUpdateQueue(current, workInProgress2);
            processUpdateQueue(workInProgress2, props, null, renderLanes2);
            var nextState = workInProgress2.memoizedState;
            props = nextState.cache;
            pushProvider(workInProgress2, CacheContext, props);
            props !== prevState.cache && propagateContextChanges(
              workInProgress2,
              [CacheContext],
              renderLanes2,
              true
            );
            suspendIfUpdateReadFromEntangledAsyncAction();
            props = nextState.element;
            if (prevState.isDehydrated)
              if (prevState = {
                element: props,
                isDehydrated: false,
                cache: nextState.cache
              }, workInProgress2.updateQueue.baseState = prevState, workInProgress2.memoizedState = prevState, workInProgress2.flags & 256) {
                workInProgress2 = mountHostRootWithoutHydrating(
                  current,
                  workInProgress2,
                  props,
                  renderLanes2
                );
                break a;
              } else if (props !== $$typeof) {
                $$typeof = createCapturedValueAtFiber(
                  Error(formatProdErrorMessage(424)),
                  workInProgress2
                );
                queueHydrationError($$typeof);
                workInProgress2 = mountHostRootWithoutHydrating(
                  current,
                  workInProgress2,
                  props,
                  renderLanes2
                );
                break a;
              } else {
                current = workInProgress2.stateNode.containerInfo;
                switch (current.nodeType) {
                  case 9:
                    current = current.body;
                    break;
                  default:
                    current = "HTML" === current.nodeName ? current.ownerDocument.body : current;
                }
                nextHydratableInstance = getNextHydratable(current.firstChild);
                hydrationParentFiber = workInProgress2;
                isHydrating = true;
                hydrationErrors = null;
                rootOrSingletonContext = true;
                renderLanes2 = mountChildFibers(
                  workInProgress2,
                  null,
                  props,
                  renderLanes2
                );
                for (workInProgress2.child = renderLanes2; renderLanes2; )
                  renderLanes2.flags = renderLanes2.flags & -3 | 4096, renderLanes2 = renderLanes2.sibling;
              }
            else {
              resetHydrationState();
              if (props === $$typeof) {
                workInProgress2 = bailoutOnAlreadyFinishedWork(
                  current,
                  workInProgress2,
                  renderLanes2
                );
                break a;
              }
              reconcileChildren(current, workInProgress2, props, renderLanes2);
            }
            workInProgress2 = workInProgress2.child;
          }
          return workInProgress2;
        case 26:
          return markRef(current, workInProgress2), null === current ? (renderLanes2 = getResource(
            workInProgress2.type,
            null,
            workInProgress2.pendingProps,
            null
          )) ? workInProgress2.memoizedState = renderLanes2 : isHydrating || (renderLanes2 = workInProgress2.type, current = workInProgress2.pendingProps, props = getOwnerDocumentFromRootContainer(
            rootInstanceStackCursor.current
          ).createElement(renderLanes2), props[internalInstanceKey] = workInProgress2, props[internalPropsKey] = current, setInitialProperties(props, renderLanes2, current), markNodeAsHoistable(props), workInProgress2.stateNode = props) : workInProgress2.memoizedState = getResource(
            workInProgress2.type,
            current.memoizedProps,
            workInProgress2.pendingProps,
            current.memoizedState
          ), null;
        case 27:
          return pushHostContext(workInProgress2), null === current && isHydrating && (props = workInProgress2.stateNode = resolveSingletonInstance(
            workInProgress2.type,
            workInProgress2.pendingProps,
            rootInstanceStackCursor.current
          ), hydrationParentFiber = workInProgress2, rootOrSingletonContext = true, $$typeof = nextHydratableInstance, isSingletonScope(workInProgress2.type) ? (previousHydratableOnEnteringScopedSingleton = $$typeof, nextHydratableInstance = getNextHydratable(props.firstChild)) : nextHydratableInstance = $$typeof), reconcileChildren(
            current,
            workInProgress2,
            workInProgress2.pendingProps.children,
            renderLanes2
          ), markRef(current, workInProgress2), null === current && (workInProgress2.flags |= 4194304), workInProgress2.child;
        case 5:
          if (null === current && isHydrating) {
            if ($$typeof = props = nextHydratableInstance)
              props = canHydrateInstance(
                props,
                workInProgress2.type,
                workInProgress2.pendingProps,
                rootOrSingletonContext
              ), null !== props ? (workInProgress2.stateNode = props, hydrationParentFiber = workInProgress2, nextHydratableInstance = getNextHydratable(props.firstChild), rootOrSingletonContext = false, $$typeof = true) : $$typeof = false;
            $$typeof || throwOnHydrationMismatch(workInProgress2);
          }
          pushHostContext(workInProgress2);
          $$typeof = workInProgress2.type;
          prevState = workInProgress2.pendingProps;
          nextState = null !== current ? current.memoizedProps : null;
          props = prevState.children;
          shouldSetTextContent($$typeof, prevState) ? props = null : null !== nextState && shouldSetTextContent($$typeof, nextState) && (workInProgress2.flags |= 32);
          null !== workInProgress2.memoizedState && ($$typeof = renderWithHooks(
            current,
            workInProgress2,
            TransitionAwareHostComponent,
            null,
            null,
            renderLanes2
          ), HostTransitionContext._currentValue = $$typeof);
          markRef(current, workInProgress2);
          reconcileChildren(current, workInProgress2, props, renderLanes2);
          return workInProgress2.child;
        case 6:
          if (null === current && isHydrating) {
            if (current = renderLanes2 = nextHydratableInstance)
              renderLanes2 = canHydrateTextInstance(
                renderLanes2,
                workInProgress2.pendingProps,
                rootOrSingletonContext
              ), null !== renderLanes2 ? (workInProgress2.stateNode = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null, current = true) : current = false;
            current || throwOnHydrationMismatch(workInProgress2);
          }
          return null;
        case 13:
          return updateSuspenseComponent(current, workInProgress2, renderLanes2);
        case 4:
          return pushHostContainer(
            workInProgress2,
            workInProgress2.stateNode.containerInfo
          ), props = workInProgress2.pendingProps, null === current ? workInProgress2.child = reconcileChildFibers(
            workInProgress2,
            null,
            props,
            renderLanes2
          ) : reconcileChildren(current, workInProgress2, props, renderLanes2), workInProgress2.child;
        case 11:
          return updateForwardRef(
            current,
            workInProgress2,
            workInProgress2.type,
            workInProgress2.pendingProps,
            renderLanes2
          );
        case 7:
          return reconcileChildren(
            current,
            workInProgress2,
            workInProgress2.pendingProps,
            renderLanes2
          ), workInProgress2.child;
        case 8:
          return reconcileChildren(
            current,
            workInProgress2,
            workInProgress2.pendingProps.children,
            renderLanes2
          ), workInProgress2.child;
        case 12:
          return reconcileChildren(
            current,
            workInProgress2,
            workInProgress2.pendingProps.children,
            renderLanes2
          ), workInProgress2.child;
        case 10:
          return props = workInProgress2.pendingProps, pushProvider(workInProgress2, workInProgress2.type, props.value), reconcileChildren(current, workInProgress2, props.children, renderLanes2), workInProgress2.child;
        case 9:
          return $$typeof = workInProgress2.type._context, props = workInProgress2.pendingProps.children, prepareToReadContext(workInProgress2), $$typeof = readContext($$typeof), props = props($$typeof), workInProgress2.flags |= 1, reconcileChildren(current, workInProgress2, props, renderLanes2), workInProgress2.child;
        case 14:
          return updateMemoComponent(
            current,
            workInProgress2,
            workInProgress2.type,
            workInProgress2.pendingProps,
            renderLanes2
          );
        case 15:
          return updateSimpleMemoComponent(
            current,
            workInProgress2,
            workInProgress2.type,
            workInProgress2.pendingProps,
            renderLanes2
          );
        case 19:
          return updateSuspenseListComponent(current, workInProgress2, renderLanes2);
        case 31:
          return updateActivityComponent(current, workInProgress2, renderLanes2);
        case 22:
          return updateOffscreenComponent(
            current,
            workInProgress2,
            renderLanes2,
            workInProgress2.pendingProps
          );
        case 24:
          return prepareToReadContext(workInProgress2), props = readContext(CacheContext), null === current ? ($$typeof = peekCacheFromPool(), null === $$typeof && ($$typeof = workInProgressRoot, prevState = createCache(), $$typeof.pooledCache = prevState, prevState.refCount++, null !== prevState && ($$typeof.pooledCacheLanes |= renderLanes2), $$typeof = prevState), workInProgress2.memoizedState = { parent: props, cache: $$typeof }, initializeUpdateQueue(workInProgress2), pushProvider(workInProgress2, CacheContext, $$typeof)) : (0 !== (current.lanes & renderLanes2) && (cloneUpdateQueue(current, workInProgress2), processUpdateQueue(workInProgress2, null, null, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction()), $$typeof = current.memoizedState, prevState = workInProgress2.memoizedState, $$typeof.parent !== props ? ($$typeof = { parent: props, cache: props }, workInProgress2.memoizedState = $$typeof, 0 === workInProgress2.lanes && (workInProgress2.memoizedState = workInProgress2.updateQueue.baseState = $$typeof), pushProvider(workInProgress2, CacheContext, props)) : (props = prevState.cache, pushProvider(workInProgress2, CacheContext, props), props !== $$typeof.cache && propagateContextChanges(
            workInProgress2,
            [CacheContext],
            renderLanes2,
            true
          ))), reconcileChildren(
            current,
            workInProgress2,
            workInProgress2.pendingProps.children,
            renderLanes2
          ), workInProgress2.child;
        case 29:
          throw workInProgress2.pendingProps;
      }
      throw Error(formatProdErrorMessage(156, workInProgress2.tag));
    }
    function markUpdate(workInProgress2) {
      workInProgress2.flags |= 4;
    }
    function preloadInstanceAndSuspendIfNeeded(workInProgress2, type, oldProps, newProps, renderLanes2) {
      if (type = 0 !== (workInProgress2.mode & 32)) type = false;
      if (type) {
        if (workInProgress2.flags |= 16777216, (renderLanes2 & 335544128) === renderLanes2)
          if (workInProgress2.stateNode.complete) workInProgress2.flags |= 8192;
          else if (shouldRemainOnPreviousScreen()) workInProgress2.flags |= 8192;
          else
            throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
      } else workInProgress2.flags &= -16777217;
    }
    function preloadResourceAndSuspendIfNeeded(workInProgress2, resource) {
      if ("stylesheet" !== resource.type || 0 !== (resource.state.loading & 4))
        workInProgress2.flags &= -16777217;
      else if (workInProgress2.flags |= 16777216, !preloadResource(resource))
        if (shouldRemainOnPreviousScreen()) workInProgress2.flags |= 8192;
        else
          throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
    }
    function scheduleRetryEffect(workInProgress2, retryQueue) {
      null !== retryQueue && (workInProgress2.flags |= 4);
      workInProgress2.flags & 16384 && (retryQueue = 22 !== workInProgress2.tag ? claimNextRetryLane() : 536870912, workInProgress2.lanes |= retryQueue, workInProgressSuspendedRetryLanes |= retryQueue);
    }
    function cutOffTailIfNeeded(renderState, hasRenderedATailFallback) {
      if (!isHydrating)
        switch (renderState.tailMode) {
          case "hidden":
            hasRenderedATailFallback = renderState.tail;
            for (var lastTailNode = null; null !== hasRenderedATailFallback; )
              null !== hasRenderedATailFallback.alternate && (lastTailNode = hasRenderedATailFallback), hasRenderedATailFallback = hasRenderedATailFallback.sibling;
            null === lastTailNode ? renderState.tail = null : lastTailNode.sibling = null;
            break;
          case "collapsed":
            lastTailNode = renderState.tail;
            for (var lastTailNode$106 = null; null !== lastTailNode; )
              null !== lastTailNode.alternate && (lastTailNode$106 = lastTailNode), lastTailNode = lastTailNode.sibling;
            null === lastTailNode$106 ? hasRenderedATailFallback || null === renderState.tail ? renderState.tail = null : renderState.tail.sibling = null : lastTailNode$106.sibling = null;
        }
    }
    function bubbleProperties(completedWork) {
      var didBailout = null !== completedWork.alternate && completedWork.alternate.child === completedWork.child, newChildLanes = 0, subtreeFlags = 0;
      if (didBailout)
        for (var child$107 = completedWork.child; null !== child$107; )
          newChildLanes |= child$107.lanes | child$107.childLanes, subtreeFlags |= child$107.subtreeFlags & 65011712, subtreeFlags |= child$107.flags & 65011712, child$107.return = completedWork, child$107 = child$107.sibling;
      else
        for (child$107 = completedWork.child; null !== child$107; )
          newChildLanes |= child$107.lanes | child$107.childLanes, subtreeFlags |= child$107.subtreeFlags, subtreeFlags |= child$107.flags, child$107.return = completedWork, child$107 = child$107.sibling;
      completedWork.subtreeFlags |= subtreeFlags;
      completedWork.childLanes = newChildLanes;
      return didBailout;
    }
    function completeWork(current, workInProgress2, renderLanes2) {
      var newProps = workInProgress2.pendingProps;
      popTreeContext(workInProgress2);
      switch (workInProgress2.tag) {
        case 16:
        case 15:
        case 0:
        case 11:
        case 7:
        case 8:
        case 12:
        case 9:
        case 14:
          return bubbleProperties(workInProgress2), null;
        case 1:
          return bubbleProperties(workInProgress2), null;
        case 3:
          renderLanes2 = workInProgress2.stateNode;
          newProps = null;
          null !== current && (newProps = current.memoizedState.cache);
          workInProgress2.memoizedState.cache !== newProps && (workInProgress2.flags |= 2048);
          popProvider(CacheContext);
          popHostContainer();
          renderLanes2.pendingContext && (renderLanes2.context = renderLanes2.pendingContext, renderLanes2.pendingContext = null);
          if (null === current || null === current.child)
            popHydrationState(workInProgress2) ? markUpdate(workInProgress2) : null === current || current.memoizedState.isDehydrated && 0 === (workInProgress2.flags & 256) || (workInProgress2.flags |= 1024, upgradeHydrationErrorsToRecoverable());
          bubbleProperties(workInProgress2);
          return null;
        case 26:
          var type = workInProgress2.type, nextResource = workInProgress2.memoizedState;
          null === current ? (markUpdate(workInProgress2), null !== nextResource ? (bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(workInProgress2, nextResource)) : (bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(
            workInProgress2,
            type,
            null,
            newProps,
            renderLanes2
          ))) : nextResource ? nextResource !== current.memoizedState ? (markUpdate(workInProgress2), bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(workInProgress2, nextResource)) : (bubbleProperties(workInProgress2), workInProgress2.flags &= -16777217) : (current = current.memoizedProps, current !== newProps && markUpdate(workInProgress2), bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(
            workInProgress2,
            type,
            current,
            newProps,
            renderLanes2
          ));
          return null;
        case 27:
          popHostContext(workInProgress2);
          renderLanes2 = rootInstanceStackCursor.current;
          type = workInProgress2.type;
          if (null !== current && null != workInProgress2.stateNode)
            current.memoizedProps !== newProps && markUpdate(workInProgress2);
          else {
            if (!newProps) {
              if (null === workInProgress2.stateNode)
                throw Error(formatProdErrorMessage(166));
              bubbleProperties(workInProgress2);
              return null;
            }
            current = contextStackCursor.current;
            popHydrationState(workInProgress2) ? prepareToHydrateHostInstance(workInProgress2, current) : (current = resolveSingletonInstance(type, newProps, renderLanes2), workInProgress2.stateNode = current, markUpdate(workInProgress2));
          }
          bubbleProperties(workInProgress2);
          return null;
        case 5:
          popHostContext(workInProgress2);
          type = workInProgress2.type;
          if (null !== current && null != workInProgress2.stateNode)
            current.memoizedProps !== newProps && markUpdate(workInProgress2);
          else {
            if (!newProps) {
              if (null === workInProgress2.stateNode)
                throw Error(formatProdErrorMessage(166));
              bubbleProperties(workInProgress2);
              return null;
            }
            nextResource = contextStackCursor.current;
            if (popHydrationState(workInProgress2))
              prepareToHydrateHostInstance(workInProgress2, nextResource);
            else {
              var ownerDocument = getOwnerDocumentFromRootContainer(
                rootInstanceStackCursor.current
              );
              switch (nextResource) {
                case 1:
                  nextResource = ownerDocument.createElementNS(
                    "http://www.w3.org/2000/svg",
                    type
                  );
                  break;
                case 2:
                  nextResource = ownerDocument.createElementNS(
                    "http://www.w3.org/1998/Math/MathML",
                    type
                  );
                  break;
                default:
                  switch (type) {
                    case "svg":
                      nextResource = ownerDocument.createElementNS(
                        "http://www.w3.org/2000/svg",
                        type
                      );
                      break;
                    case "math":
                      nextResource = ownerDocument.createElementNS(
                        "http://www.w3.org/1998/Math/MathML",
                        type
                      );
                      break;
                    case "script":
                      nextResource = ownerDocument.createElement("div");
                      nextResource.innerHTML = "<script><\/script>";
                      nextResource = nextResource.removeChild(
                        nextResource.firstChild
                      );
                      break;
                    case "select":
                      nextResource = "string" === typeof newProps.is ? ownerDocument.createElement("select", {
                        is: newProps.is
                      }) : ownerDocument.createElement("select");
                      newProps.multiple ? nextResource.multiple = true : newProps.size && (nextResource.size = newProps.size);
                      break;
                    default:
                      nextResource = "string" === typeof newProps.is ? ownerDocument.createElement(type, { is: newProps.is }) : ownerDocument.createElement(type);
                  }
              }
              nextResource[internalInstanceKey] = workInProgress2;
              nextResource[internalPropsKey] = newProps;
              a: for (ownerDocument = workInProgress2.child; null !== ownerDocument; ) {
                if (5 === ownerDocument.tag || 6 === ownerDocument.tag)
                  nextResource.appendChild(ownerDocument.stateNode);
                else if (4 !== ownerDocument.tag && 27 !== ownerDocument.tag && null !== ownerDocument.child) {
                  ownerDocument.child.return = ownerDocument;
                  ownerDocument = ownerDocument.child;
                  continue;
                }
                if (ownerDocument === workInProgress2) break a;
                for (; null === ownerDocument.sibling; ) {
                  if (null === ownerDocument.return || ownerDocument.return === workInProgress2)
                    break a;
                  ownerDocument = ownerDocument.return;
                }
                ownerDocument.sibling.return = ownerDocument.return;
                ownerDocument = ownerDocument.sibling;
              }
              workInProgress2.stateNode = nextResource;
              a: switch (setInitialProperties(nextResource, type, newProps), type) {
                case "button":
                case "input":
                case "select":
                case "textarea":
                  newProps = !!newProps.autoFocus;
                  break a;
                case "img":
                  newProps = true;
                  break a;
                default:
                  newProps = false;
              }
              newProps && markUpdate(workInProgress2);
            }
          }
          bubbleProperties(workInProgress2);
          preloadInstanceAndSuspendIfNeeded(
            workInProgress2,
            workInProgress2.type,
            null === current ? null : current.memoizedProps,
            workInProgress2.pendingProps,
            renderLanes2
          );
          return null;
        case 6:
          if (current && null != workInProgress2.stateNode)
            current.memoizedProps !== newProps && markUpdate(workInProgress2);
          else {
            if ("string" !== typeof newProps && null === workInProgress2.stateNode)
              throw Error(formatProdErrorMessage(166));
            current = rootInstanceStackCursor.current;
            if (popHydrationState(workInProgress2)) {
              current = workInProgress2.stateNode;
              renderLanes2 = workInProgress2.memoizedProps;
              newProps = null;
              type = hydrationParentFiber;
              if (null !== type)
                switch (type.tag) {
                  case 27:
                  case 5:
                    newProps = type.memoizedProps;
                }
              current[internalInstanceKey] = workInProgress2;
              current = current.nodeValue === renderLanes2 || null !== newProps && true === newProps.suppressHydrationWarning || checkForUnmatchedText(current.nodeValue, renderLanes2) ? true : false;
              current || throwOnHydrationMismatch(workInProgress2, true);
            } else
              current = getOwnerDocumentFromRootContainer(current).createTextNode(
                newProps
              ), current[internalInstanceKey] = workInProgress2, workInProgress2.stateNode = current;
          }
          bubbleProperties(workInProgress2);
          return null;
        case 31:
          renderLanes2 = workInProgress2.memoizedState;
          if (null === current || null !== current.memoizedState) {
            newProps = popHydrationState(workInProgress2);
            if (null !== renderLanes2) {
              if (null === current) {
                if (!newProps) throw Error(formatProdErrorMessage(318));
                current = workInProgress2.memoizedState;
                current = null !== current ? current.dehydrated : null;
                if (!current) throw Error(formatProdErrorMessage(557));
                current[internalInstanceKey] = workInProgress2;
              } else
                resetHydrationState(), 0 === (workInProgress2.flags & 128) && (workInProgress2.memoizedState = null), workInProgress2.flags |= 4;
              bubbleProperties(workInProgress2);
              current = false;
            } else
              renderLanes2 = upgradeHydrationErrorsToRecoverable(), null !== current && null !== current.memoizedState && (current.memoizedState.hydrationErrors = renderLanes2), current = true;
            if (!current) {
              if (workInProgress2.flags & 256)
                return popSuspenseHandler(workInProgress2), workInProgress2;
              popSuspenseHandler(workInProgress2);
              return null;
            }
            if (0 !== (workInProgress2.flags & 128))
              throw Error(formatProdErrorMessage(558));
          }
          bubbleProperties(workInProgress2);
          return null;
        case 13:
          newProps = workInProgress2.memoizedState;
          if (null === current || null !== current.memoizedState && null !== current.memoizedState.dehydrated) {
            type = popHydrationState(workInProgress2);
            if (null !== newProps && null !== newProps.dehydrated) {
              if (null === current) {
                if (!type) throw Error(formatProdErrorMessage(318));
                type = workInProgress2.memoizedState;
                type = null !== type ? type.dehydrated : null;
                if (!type) throw Error(formatProdErrorMessage(317));
                type[internalInstanceKey] = workInProgress2;
              } else
                resetHydrationState(), 0 === (workInProgress2.flags & 128) && (workInProgress2.memoizedState = null), workInProgress2.flags |= 4;
              bubbleProperties(workInProgress2);
              type = false;
            } else
              type = upgradeHydrationErrorsToRecoverable(), null !== current && null !== current.memoizedState && (current.memoizedState.hydrationErrors = type), type = true;
            if (!type) {
              if (workInProgress2.flags & 256)
                return popSuspenseHandler(workInProgress2), workInProgress2;
              popSuspenseHandler(workInProgress2);
              return null;
            }
          }
          popSuspenseHandler(workInProgress2);
          if (0 !== (workInProgress2.flags & 128))
            return workInProgress2.lanes = renderLanes2, workInProgress2;
          renderLanes2 = null !== newProps;
          current = null !== current && null !== current.memoizedState;
          renderLanes2 && (newProps = workInProgress2.child, type = null, null !== newProps.alternate && null !== newProps.alternate.memoizedState && null !== newProps.alternate.memoizedState.cachePool && (type = newProps.alternate.memoizedState.cachePool.pool), nextResource = null, null !== newProps.memoizedState && null !== newProps.memoizedState.cachePool && (nextResource = newProps.memoizedState.cachePool.pool), nextResource !== type && (newProps.flags |= 2048));
          renderLanes2 !== current && renderLanes2 && (workInProgress2.child.flags |= 8192);
          scheduleRetryEffect(workInProgress2, workInProgress2.updateQueue);
          bubbleProperties(workInProgress2);
          return null;
        case 4:
          return popHostContainer(), null === current && listenToAllSupportedEvents(workInProgress2.stateNode.containerInfo), bubbleProperties(workInProgress2), null;
        case 10:
          return popProvider(workInProgress2.type), bubbleProperties(workInProgress2), null;
        case 19:
          pop(suspenseStackCursor);
          newProps = workInProgress2.memoizedState;
          if (null === newProps) return bubbleProperties(workInProgress2), null;
          type = 0 !== (workInProgress2.flags & 128);
          nextResource = newProps.rendering;
          if (null === nextResource)
            if (type) cutOffTailIfNeeded(newProps, false);
            else {
              if (0 !== workInProgressRootExitStatus || null !== current && 0 !== (current.flags & 128))
                for (current = workInProgress2.child; null !== current; ) {
                  nextResource = findFirstSuspended(current);
                  if (null !== nextResource) {
                    workInProgress2.flags |= 128;
                    cutOffTailIfNeeded(newProps, false);
                    current = nextResource.updateQueue;
                    workInProgress2.updateQueue = current;
                    scheduleRetryEffect(workInProgress2, current);
                    workInProgress2.subtreeFlags = 0;
                    current = renderLanes2;
                    for (renderLanes2 = workInProgress2.child; null !== renderLanes2; )
                      resetWorkInProgress(renderLanes2, current), renderLanes2 = renderLanes2.sibling;
                    push(
                      suspenseStackCursor,
                      suspenseStackCursor.current & 1 | 2
                    );
                    isHydrating && pushTreeFork(workInProgress2, newProps.treeForkCount);
                    return workInProgress2.child;
                  }
                  current = current.sibling;
                }
              null !== newProps.tail && now() > workInProgressRootRenderTargetTime && (workInProgress2.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress2.lanes = 4194304);
            }
          else {
            if (!type)
              if (current = findFirstSuspended(nextResource), null !== current) {
                if (workInProgress2.flags |= 128, type = true, current = current.updateQueue, workInProgress2.updateQueue = current, scheduleRetryEffect(workInProgress2, current), cutOffTailIfNeeded(newProps, true), null === newProps.tail && "hidden" === newProps.tailMode && !nextResource.alternate && !isHydrating)
                  return bubbleProperties(workInProgress2), null;
              } else
                2 * now() - newProps.renderingStartTime > workInProgressRootRenderTargetTime && 536870912 !== renderLanes2 && (workInProgress2.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress2.lanes = 4194304);
            newProps.isBackwards ? (nextResource.sibling = workInProgress2.child, workInProgress2.child = nextResource) : (current = newProps.last, null !== current ? current.sibling = nextResource : workInProgress2.child = nextResource, newProps.last = nextResource);
          }
          if (null !== newProps.tail)
            return current = newProps.tail, newProps.rendering = current, newProps.tail = current.sibling, newProps.renderingStartTime = now(), current.sibling = null, renderLanes2 = suspenseStackCursor.current, push(
              suspenseStackCursor,
              type ? renderLanes2 & 1 | 2 : renderLanes2 & 1
            ), isHydrating && pushTreeFork(workInProgress2, newProps.treeForkCount), current;
          bubbleProperties(workInProgress2);
          return null;
        case 22:
        case 23:
          return popSuspenseHandler(workInProgress2), popHiddenContext(), newProps = null !== workInProgress2.memoizedState, null !== current ? null !== current.memoizedState !== newProps && (workInProgress2.flags |= 8192) : newProps && (workInProgress2.flags |= 8192), newProps ? 0 !== (renderLanes2 & 536870912) && 0 === (workInProgress2.flags & 128) && (bubbleProperties(workInProgress2), workInProgress2.subtreeFlags & 6 && (workInProgress2.flags |= 8192)) : bubbleProperties(workInProgress2), renderLanes2 = workInProgress2.updateQueue, null !== renderLanes2 && scheduleRetryEffect(workInProgress2, renderLanes2.retryQueue), renderLanes2 = null, null !== current && null !== current.memoizedState && null !== current.memoizedState.cachePool && (renderLanes2 = current.memoizedState.cachePool.pool), newProps = null, null !== workInProgress2.memoizedState && null !== workInProgress2.memoizedState.cachePool && (newProps = workInProgress2.memoizedState.cachePool.pool), newProps !== renderLanes2 && (workInProgress2.flags |= 2048), null !== current && pop(resumedCache), null;
        case 24:
          return renderLanes2 = null, null !== current && (renderLanes2 = current.memoizedState.cache), workInProgress2.memoizedState.cache !== renderLanes2 && (workInProgress2.flags |= 2048), popProvider(CacheContext), bubbleProperties(workInProgress2), null;
        case 25:
          return null;
        case 30:
          return null;
      }
      throw Error(formatProdErrorMessage(156, workInProgress2.tag));
    }
    function unwindWork(current, workInProgress2) {
      popTreeContext(workInProgress2);
      switch (workInProgress2.tag) {
        case 1:
          return current = workInProgress2.flags, current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
        case 3:
          return popProvider(CacheContext), popHostContainer(), current = workInProgress2.flags, 0 !== (current & 65536) && 0 === (current & 128) ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
        case 26:
        case 27:
        case 5:
          return popHostContext(workInProgress2), null;
        case 31:
          if (null !== workInProgress2.memoizedState) {
            popSuspenseHandler(workInProgress2);
            if (null === workInProgress2.alternate)
              throw Error(formatProdErrorMessage(340));
            resetHydrationState();
          }
          current = workInProgress2.flags;
          return current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
        case 13:
          popSuspenseHandler(workInProgress2);
          current = workInProgress2.memoizedState;
          if (null !== current && null !== current.dehydrated) {
            if (null === workInProgress2.alternate)
              throw Error(formatProdErrorMessage(340));
            resetHydrationState();
          }
          current = workInProgress2.flags;
          return current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
        case 19:
          return pop(suspenseStackCursor), null;
        case 4:
          return popHostContainer(), null;
        case 10:
          return popProvider(workInProgress2.type), null;
        case 22:
        case 23:
          return popSuspenseHandler(workInProgress2), popHiddenContext(), null !== current && pop(resumedCache), current = workInProgress2.flags, current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
        case 24:
          return popProvider(CacheContext), null;
        case 25:
          return null;
        default:
          return null;
      }
    }
    function unwindInterruptedWork(current, interruptedWork) {
      popTreeContext(interruptedWork);
      switch (interruptedWork.tag) {
        case 3:
          popProvider(CacheContext);
          popHostContainer();
          break;
        case 26:
        case 27:
        case 5:
          popHostContext(interruptedWork);
          break;
        case 4:
          popHostContainer();
          break;
        case 31:
          null !== interruptedWork.memoizedState && popSuspenseHandler(interruptedWork);
          break;
        case 13:
          popSuspenseHandler(interruptedWork);
          break;
        case 19:
          pop(suspenseStackCursor);
          break;
        case 10:
          popProvider(interruptedWork.type);
          break;
        case 22:
        case 23:
          popSuspenseHandler(interruptedWork);
          popHiddenContext();
          null !== current && pop(resumedCache);
          break;
        case 24:
          popProvider(CacheContext);
      }
    }
    function commitHookEffectListMount(flags, finishedWork) {
      try {
        var updateQueue = finishedWork.updateQueue, lastEffect = null !== updateQueue ? updateQueue.lastEffect : null;
        if (null !== lastEffect) {
          var firstEffect = lastEffect.next;
          updateQueue = firstEffect;
          do {
            if ((updateQueue.tag & flags) === flags) {
              lastEffect = void 0;
              var create = updateQueue.create, inst = updateQueue.inst;
              lastEffect = create();
              inst.destroy = lastEffect;
            }
            updateQueue = updateQueue.next;
          } while (updateQueue !== firstEffect);
        }
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitHookEffectListUnmount(flags, finishedWork, nearestMountedAncestor$jscomp$0) {
      try {
        var updateQueue = finishedWork.updateQueue, lastEffect = null !== updateQueue ? updateQueue.lastEffect : null;
        if (null !== lastEffect) {
          var firstEffect = lastEffect.next;
          updateQueue = firstEffect;
          do {
            if ((updateQueue.tag & flags) === flags) {
              var inst = updateQueue.inst, destroy = inst.destroy;
              if (void 0 !== destroy) {
                inst.destroy = void 0;
                lastEffect = finishedWork;
                var nearestMountedAncestor = nearestMountedAncestor$jscomp$0, destroy_ = destroy;
                try {
                  destroy_();
                } catch (error) {
                  captureCommitPhaseError(
                    lastEffect,
                    nearestMountedAncestor,
                    error
                  );
                }
              }
            }
            updateQueue = updateQueue.next;
          } while (updateQueue !== firstEffect);
        }
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitClassCallbacks(finishedWork) {
      var updateQueue = finishedWork.updateQueue;
      if (null !== updateQueue) {
        var instance = finishedWork.stateNode;
        try {
          commitCallbacks(updateQueue, instance);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
    }
    function safelyCallComponentWillUnmount(current, nearestMountedAncestor, instance) {
      instance.props = resolveClassComponentProps(
        current.type,
        current.memoizedProps
      );
      instance.state = current.memoizedState;
      try {
        instance.componentWillUnmount();
      } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error);
      }
    }
    function safelyAttachRef(current, nearestMountedAncestor) {
      try {
        var ref = current.ref;
        if (null !== ref) {
          switch (current.tag) {
            case 26:
            case 27:
            case 5:
              var instanceToUse = current.stateNode;
              break;
            case 30:
              instanceToUse = current.stateNode;
              break;
            default:
              instanceToUse = current.stateNode;
          }
          "function" === typeof ref ? current.refCleanup = ref(instanceToUse) : ref.current = instanceToUse;
        }
      } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error);
      }
    }
    function safelyDetachRef(current, nearestMountedAncestor) {
      var ref = current.ref, refCleanup = current.refCleanup;
      if (null !== ref)
        if ("function" === typeof refCleanup)
          try {
            refCleanup();
          } catch (error) {
            captureCommitPhaseError(current, nearestMountedAncestor, error);
          } finally {
            current.refCleanup = null, current = current.alternate, null != current && (current.refCleanup = null);
          }
        else if ("function" === typeof ref)
          try {
            ref(null);
          } catch (error$140) {
            captureCommitPhaseError(current, nearestMountedAncestor, error$140);
          }
        else ref.current = null;
    }
    function commitHostMount(finishedWork) {
      var type = finishedWork.type, props = finishedWork.memoizedProps, instance = finishedWork.stateNode;
      try {
        a: switch (type) {
          case "button":
          case "input":
          case "select":
          case "textarea":
            props.autoFocus && instance.focus();
            break a;
          case "img":
            props.src ? instance.src = props.src : props.srcSet && (instance.srcset = props.srcSet);
        }
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitHostUpdate(finishedWork, newProps, oldProps) {
      try {
        var domElement = finishedWork.stateNode;
        updateProperties(domElement, finishedWork.type, oldProps, newProps);
        domElement[internalPropsKey] = newProps;
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function isHostParent(fiber) {
      return 5 === fiber.tag || 3 === fiber.tag || 26 === fiber.tag || 27 === fiber.tag && isSingletonScope(fiber.type) || 4 === fiber.tag;
    }
    function getHostSibling(fiber) {
      a: for (; ; ) {
        for (; null === fiber.sibling; ) {
          if (null === fiber.return || isHostParent(fiber.return)) return null;
          fiber = fiber.return;
        }
        fiber.sibling.return = fiber.return;
        for (fiber = fiber.sibling; 5 !== fiber.tag && 6 !== fiber.tag && 18 !== fiber.tag; ) {
          if (27 === fiber.tag && isSingletonScope(fiber.type)) continue a;
          if (fiber.flags & 2) continue a;
          if (null === fiber.child || 4 === fiber.tag) continue a;
          else fiber.child.return = fiber, fiber = fiber.child;
        }
        if (!(fiber.flags & 2)) return fiber.stateNode;
      }
    }
    function insertOrAppendPlacementNodeIntoContainer(node, before, parent) {
      var tag = node.tag;
      if (5 === tag || 6 === tag)
        node = node.stateNode, before ? (9 === parent.nodeType ? parent.body : "HTML" === parent.nodeName ? parent.ownerDocument.body : parent).insertBefore(node, before) : (before = 9 === parent.nodeType ? parent.body : "HTML" === parent.nodeName ? parent.ownerDocument.body : parent, before.appendChild(node), parent = parent._reactRootContainer, null !== parent && void 0 !== parent || null !== before.onclick || (before.onclick = noop$1));
      else if (4 !== tag && (27 === tag && isSingletonScope(node.type) && (parent = node.stateNode, before = null), node = node.child, null !== node))
        for (insertOrAppendPlacementNodeIntoContainer(node, before, parent), node = node.sibling; null !== node; )
          insertOrAppendPlacementNodeIntoContainer(node, before, parent), node = node.sibling;
    }
    function insertOrAppendPlacementNode(node, before, parent) {
      var tag = node.tag;
      if (5 === tag || 6 === tag)
        node = node.stateNode, before ? parent.insertBefore(node, before) : parent.appendChild(node);
      else if (4 !== tag && (27 === tag && isSingletonScope(node.type) && (parent = node.stateNode), node = node.child, null !== node))
        for (insertOrAppendPlacementNode(node, before, parent), node = node.sibling; null !== node; )
          insertOrAppendPlacementNode(node, before, parent), node = node.sibling;
    }
    function commitHostSingletonAcquisition(finishedWork) {
      var singleton = finishedWork.stateNode, props = finishedWork.memoizedProps;
      try {
        for (var type = finishedWork.type, attributes = singleton.attributes; attributes.length; )
          singleton.removeAttributeNode(attributes[0]);
        setInitialProperties(singleton, type, props);
        singleton[internalInstanceKey] = finishedWork;
        singleton[internalPropsKey] = props;
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    var offscreenSubtreeIsHidden = false;
    var offscreenSubtreeWasHidden = false;
    var needsFormReset = false;
    var PossiblyWeakSet = "function" === typeof WeakSet ? WeakSet : Set;
    var nextEffect = null;
    function commitBeforeMutationEffects(root2, firstChild) {
      root2 = root2.containerInfo;
      eventsEnabled = _enabled;
      root2 = getActiveElementDeep(root2);
      if (hasSelectionCapabilities(root2)) {
        if ("selectionStart" in root2)
          var JSCompiler_temp = {
            start: root2.selectionStart,
            end: root2.selectionEnd
          };
        else
          a: {
            JSCompiler_temp = (JSCompiler_temp = root2.ownerDocument) && JSCompiler_temp.defaultView || window;
            var selection = JSCompiler_temp.getSelection && JSCompiler_temp.getSelection();
            if (selection && 0 !== selection.rangeCount) {
              JSCompiler_temp = selection.anchorNode;
              var anchorOffset = selection.anchorOffset, focusNode = selection.focusNode;
              selection = selection.focusOffset;
              try {
                JSCompiler_temp.nodeType, focusNode.nodeType;
              } catch (e$20) {
                JSCompiler_temp = null;
                break a;
              }
              var length = 0, start = -1, end = -1, indexWithinAnchor = 0, indexWithinFocus = 0, node = root2, parentNode = null;
              b: for (; ; ) {
                for (var next; ; ) {
                  node !== JSCompiler_temp || 0 !== anchorOffset && 3 !== node.nodeType || (start = length + anchorOffset);
                  node !== focusNode || 0 !== selection && 3 !== node.nodeType || (end = length + selection);
                  3 === node.nodeType && (length += node.nodeValue.length);
                  if (null === (next = node.firstChild)) break;
                  parentNode = node;
                  node = next;
                }
                for (; ; ) {
                  if (node === root2) break b;
                  parentNode === JSCompiler_temp && ++indexWithinAnchor === anchorOffset && (start = length);
                  parentNode === focusNode && ++indexWithinFocus === selection && (end = length);
                  if (null !== (next = node.nextSibling)) break;
                  node = parentNode;
                  parentNode = node.parentNode;
                }
                node = next;
              }
              JSCompiler_temp = -1 === start || -1 === end ? null : { start, end };
            } else JSCompiler_temp = null;
          }
        JSCompiler_temp = JSCompiler_temp || { start: 0, end: 0 };
      } else JSCompiler_temp = null;
      selectionInformation = { focusedElem: root2, selectionRange: JSCompiler_temp };
      _enabled = false;
      for (nextEffect = firstChild; null !== nextEffect; )
        if (firstChild = nextEffect, root2 = firstChild.child, 0 !== (firstChild.subtreeFlags & 1028) && null !== root2)
          root2.return = firstChild, nextEffect = root2;
        else
          for (; null !== nextEffect; ) {
            firstChild = nextEffect;
            focusNode = firstChild.alternate;
            root2 = firstChild.flags;
            switch (firstChild.tag) {
              case 0:
                if (0 !== (root2 & 4) && (root2 = firstChild.updateQueue, root2 = null !== root2 ? root2.events : null, null !== root2))
                  for (JSCompiler_temp = 0; JSCompiler_temp < root2.length; JSCompiler_temp++)
                    anchorOffset = root2[JSCompiler_temp], anchorOffset.ref.impl = anchorOffset.nextImpl;
                break;
              case 11:
              case 15:
                break;
              case 1:
                if (0 !== (root2 & 1024) && null !== focusNode) {
                  root2 = void 0;
                  JSCompiler_temp = firstChild;
                  anchorOffset = focusNode.memoizedProps;
                  focusNode = focusNode.memoizedState;
                  selection = JSCompiler_temp.stateNode;
                  try {
                    var resolvedPrevProps = resolveClassComponentProps(
                      JSCompiler_temp.type,
                      anchorOffset
                    );
                    root2 = selection.getSnapshotBeforeUpdate(
                      resolvedPrevProps,
                      focusNode
                    );
                    selection.__reactInternalSnapshotBeforeUpdate = root2;
                  } catch (error) {
                    captureCommitPhaseError(
                      JSCompiler_temp,
                      JSCompiler_temp.return,
                      error
                    );
                  }
                }
                break;
              case 3:
                if (0 !== (root2 & 1024)) {
                  if (root2 = firstChild.stateNode.containerInfo, JSCompiler_temp = root2.nodeType, 9 === JSCompiler_temp)
                    clearContainerSparingly(root2);
                  else if (1 === JSCompiler_temp)
                    switch (root2.nodeName) {
                      case "HEAD":
                      case "HTML":
                      case "BODY":
                        clearContainerSparingly(root2);
                        break;
                      default:
                        root2.textContent = "";
                    }
                }
                break;
              case 5:
              case 26:
              case 27:
              case 6:
              case 4:
              case 17:
                break;
              default:
                if (0 !== (root2 & 1024)) throw Error(formatProdErrorMessage(163));
            }
            root2 = firstChild.sibling;
            if (null !== root2) {
              root2.return = firstChild.return;
              nextEffect = root2;
              break;
            }
            nextEffect = firstChild.return;
          }
    }
    function commitLayoutEffectOnFiber(finishedRoot, current, finishedWork) {
      var flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitHookEffectListMount(5, finishedWork);
          break;
        case 1:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          if (flags & 4)
            if (finishedRoot = finishedWork.stateNode, null === current)
              try {
                finishedRoot.componentDidMount();
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            else {
              var prevProps = resolveClassComponentProps(
                finishedWork.type,
                current.memoizedProps
              );
              current = current.memoizedState;
              try {
                finishedRoot.componentDidUpdate(
                  prevProps,
                  current,
                  finishedRoot.__reactInternalSnapshotBeforeUpdate
                );
              } catch (error$139) {
                captureCommitPhaseError(
                  finishedWork,
                  finishedWork.return,
                  error$139
                );
              }
            }
          flags & 64 && commitClassCallbacks(finishedWork);
          flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
          break;
        case 3:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          if (flags & 64 && (finishedRoot = finishedWork.updateQueue, null !== finishedRoot)) {
            current = null;
            if (null !== finishedWork.child)
              switch (finishedWork.child.tag) {
                case 27:
                case 5:
                  current = finishedWork.child.stateNode;
                  break;
                case 1:
                  current = finishedWork.child.stateNode;
              }
            try {
              commitCallbacks(finishedRoot, current);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          break;
        case 27:
          null === current && flags & 4 && commitHostSingletonAcquisition(finishedWork);
        case 26:
        case 5:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          null === current && flags & 4 && commitHostMount(finishedWork);
          flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
          break;
        case 12:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          break;
        case 31:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
          break;
        case 13:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
          flags & 64 && (finishedRoot = finishedWork.memoizedState, null !== finishedRoot && (finishedRoot = finishedRoot.dehydrated, null !== finishedRoot && (finishedWork = retryDehydratedSuspenseBoundary.bind(
            null,
            finishedWork
          ), registerSuspenseInstanceRetry(finishedRoot, finishedWork))));
          break;
        case 22:
          flags = null !== finishedWork.memoizedState || offscreenSubtreeIsHidden;
          if (!flags) {
            current = null !== current && null !== current.memoizedState || offscreenSubtreeWasHidden;
            prevProps = offscreenSubtreeIsHidden;
            var prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
            offscreenSubtreeIsHidden = flags;
            (offscreenSubtreeWasHidden = current) && !prevOffscreenSubtreeWasHidden ? recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              0 !== (finishedWork.subtreeFlags & 8772)
            ) : recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            offscreenSubtreeIsHidden = prevProps;
            offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
          }
          break;
        case 30:
          break;
        default:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      }
    }
    function detachFiberAfterEffects(fiber) {
      var alternate = fiber.alternate;
      null !== alternate && (fiber.alternate = null, detachFiberAfterEffects(alternate));
      fiber.child = null;
      fiber.deletions = null;
      fiber.sibling = null;
      5 === fiber.tag && (alternate = fiber.stateNode, null !== alternate && detachDeletedInstance(alternate));
      fiber.stateNode = null;
      fiber.return = null;
      fiber.dependencies = null;
      fiber.memoizedProps = null;
      fiber.memoizedState = null;
      fiber.pendingProps = null;
      fiber.stateNode = null;
      fiber.updateQueue = null;
    }
    var hostParent = null;
    var hostParentIsContainer = false;
    function recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, parent) {
      for (parent = parent.child; null !== parent; )
        commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, parent), parent = parent.sibling;
    }
    function commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, deletedFiber) {
      if (injectedHook && "function" === typeof injectedHook.onCommitFiberUnmount)
        try {
          injectedHook.onCommitFiberUnmount(rendererID, deletedFiber);
        } catch (err) {
        }
      switch (deletedFiber.tag) {
        case 26:
          offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          deletedFiber.memoizedState ? deletedFiber.memoizedState.count-- : deletedFiber.stateNode && (deletedFiber = deletedFiber.stateNode, deletedFiber.parentNode.removeChild(deletedFiber));
          break;
        case 27:
          offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
          var prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer;
          isSingletonScope(deletedFiber.type) && (hostParent = deletedFiber.stateNode, hostParentIsContainer = false);
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          releaseSingletonInstance(deletedFiber.stateNode);
          hostParent = prevHostParent;
          hostParentIsContainer = prevHostParentIsContainer;
          break;
        case 5:
          offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
        case 6:
          prevHostParent = hostParent;
          prevHostParentIsContainer = hostParentIsContainer;
          hostParent = null;
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          hostParent = prevHostParent;
          hostParentIsContainer = prevHostParentIsContainer;
          if (null !== hostParent)
            if (hostParentIsContainer)
              try {
                (9 === hostParent.nodeType ? hostParent.body : "HTML" === hostParent.nodeName ? hostParent.ownerDocument.body : hostParent).removeChild(deletedFiber.stateNode);
              } catch (error) {
                captureCommitPhaseError(
                  deletedFiber,
                  nearestMountedAncestor,
                  error
                );
              }
            else
              try {
                hostParent.removeChild(deletedFiber.stateNode);
              } catch (error) {
                captureCommitPhaseError(
                  deletedFiber,
                  nearestMountedAncestor,
                  error
                );
              }
          break;
        case 18:
          null !== hostParent && (hostParentIsContainer ? (finishedRoot = hostParent, clearHydrationBoundary(
            9 === finishedRoot.nodeType ? finishedRoot.body : "HTML" === finishedRoot.nodeName ? finishedRoot.ownerDocument.body : finishedRoot,
            deletedFiber.stateNode
          ), retryIfBlockedOn(finishedRoot)) : clearHydrationBoundary(hostParent, deletedFiber.stateNode));
          break;
        case 4:
          prevHostParent = hostParent;
          prevHostParentIsContainer = hostParentIsContainer;
          hostParent = deletedFiber.stateNode.containerInfo;
          hostParentIsContainer = true;
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          hostParent = prevHostParent;
          hostParentIsContainer = prevHostParentIsContainer;
          break;
        case 0:
        case 11:
        case 14:
        case 15:
          commitHookEffectListUnmount(2, deletedFiber, nearestMountedAncestor);
          offscreenSubtreeWasHidden || commitHookEffectListUnmount(4, deletedFiber, nearestMountedAncestor);
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          break;
        case 1:
          offscreenSubtreeWasHidden || (safelyDetachRef(deletedFiber, nearestMountedAncestor), prevHostParent = deletedFiber.stateNode, "function" === typeof prevHostParent.componentWillUnmount && safelyCallComponentWillUnmount(
            deletedFiber,
            nearestMountedAncestor,
            prevHostParent
          ));
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          break;
        case 21:
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          break;
        case 22:
          offscreenSubtreeWasHidden = (prevHostParent = offscreenSubtreeWasHidden) || null !== deletedFiber.memoizedState;
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
          offscreenSubtreeWasHidden = prevHostParent;
          break;
        default:
          recursivelyTraverseDeletionEffects(
            finishedRoot,
            nearestMountedAncestor,
            deletedFiber
          );
      }
    }
    function commitActivityHydrationCallbacks(finishedRoot, finishedWork) {
      if (null === finishedWork.memoizedState && (finishedRoot = finishedWork.alternate, null !== finishedRoot && (finishedRoot = finishedRoot.memoizedState, null !== finishedRoot))) {
        finishedRoot = finishedRoot.dehydrated;
        try {
          retryIfBlockedOn(finishedRoot);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
    }
    function commitSuspenseHydrationCallbacks(finishedRoot, finishedWork) {
      if (null === finishedWork.memoizedState && (finishedRoot = finishedWork.alternate, null !== finishedRoot && (finishedRoot = finishedRoot.memoizedState, null !== finishedRoot && (finishedRoot = finishedRoot.dehydrated, null !== finishedRoot))))
        try {
          retryIfBlockedOn(finishedRoot);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
    }
    function getRetryCache(finishedWork) {
      switch (finishedWork.tag) {
        case 31:
        case 13:
        case 19:
          var retryCache = finishedWork.stateNode;
          null === retryCache && (retryCache = finishedWork.stateNode = new PossiblyWeakSet());
          return retryCache;
        case 22:
          return finishedWork = finishedWork.stateNode, retryCache = finishedWork._retryCache, null === retryCache && (retryCache = finishedWork._retryCache = new PossiblyWeakSet()), retryCache;
        default:
          throw Error(formatProdErrorMessage(435, finishedWork.tag));
      }
    }
    function attachSuspenseRetryListeners(finishedWork, wakeables) {
      var retryCache = getRetryCache(finishedWork);
      wakeables.forEach(function(wakeable) {
        if (!retryCache.has(wakeable)) {
          retryCache.add(wakeable);
          var retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);
          wakeable.then(retry, retry);
        }
      });
    }
    function recursivelyTraverseMutationEffects(root$jscomp$0, parentFiber) {
      var deletions = parentFiber.deletions;
      if (null !== deletions)
        for (var i = 0; i < deletions.length; i++) {
          var childToDelete = deletions[i], root2 = root$jscomp$0, returnFiber = parentFiber, parent = returnFiber;
          a: for (; null !== parent; ) {
            switch (parent.tag) {
              case 27:
                if (isSingletonScope(parent.type)) {
                  hostParent = parent.stateNode;
                  hostParentIsContainer = false;
                  break a;
                }
                break;
              case 5:
                hostParent = parent.stateNode;
                hostParentIsContainer = false;
                break a;
              case 3:
              case 4:
                hostParent = parent.stateNode.containerInfo;
                hostParentIsContainer = true;
                break a;
            }
            parent = parent.return;
          }
          if (null === hostParent) throw Error(formatProdErrorMessage(160));
          commitDeletionEffectsOnFiber(root2, returnFiber, childToDelete);
          hostParent = null;
          hostParentIsContainer = false;
          root2 = childToDelete.alternate;
          null !== root2 && (root2.return = null);
          childToDelete.return = null;
        }
      if (parentFiber.subtreeFlags & 13886)
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          commitMutationEffectsOnFiber(parentFiber, root$jscomp$0), parentFiber = parentFiber.sibling;
    }
    var currentHoistableRoot = null;
    function commitMutationEffectsOnFiber(finishedWork, root2) {
      var current = finishedWork.alternate, flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (commitHookEffectListUnmount(3, finishedWork, finishedWork.return), commitHookEffectListMount(3, finishedWork), commitHookEffectListUnmount(5, finishedWork, finishedWork.return));
          break;
        case 1:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
          flags & 64 && offscreenSubtreeIsHidden && (finishedWork = finishedWork.updateQueue, null !== finishedWork && (flags = finishedWork.callbacks, null !== flags && (current = finishedWork.shared.hiddenCallbacks, finishedWork.shared.hiddenCallbacks = null === current ? flags : current.concat(flags))));
          break;
        case 26:
          var hoistableRoot = currentHoistableRoot;
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
          if (flags & 4) {
            var currentResource = null !== current ? current.memoizedState : null;
            flags = finishedWork.memoizedState;
            if (null === current)
              if (null === flags)
                if (null === finishedWork.stateNode) {
                  a: {
                    flags = finishedWork.type;
                    current = finishedWork.memoizedProps;
                    hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
                    b: switch (flags) {
                      case "title":
                        currentResource = hoistableRoot.getElementsByTagName("title")[0];
                        if (!currentResource || currentResource[internalHoistableMarker] || currentResource[internalInstanceKey] || "http://www.w3.org/2000/svg" === currentResource.namespaceURI || currentResource.hasAttribute("itemprop"))
                          currentResource = hoistableRoot.createElement(flags), hoistableRoot.head.insertBefore(
                            currentResource,
                            hoistableRoot.querySelector("head > title")
                          );
                        setInitialProperties(currentResource, flags, current);
                        currentResource[internalInstanceKey] = finishedWork;
                        markNodeAsHoistable(currentResource);
                        flags = currentResource;
                        break a;
                      case "link":
                        var maybeNodes = getHydratableHoistableCache(
                          "link",
                          "href",
                          hoistableRoot
                        ).get(flags + (current.href || ""));
                        if (maybeNodes) {
                          for (var i = 0; i < maybeNodes.length; i++)
                            if (currentResource = maybeNodes[i], currentResource.getAttribute("href") === (null == current.href || "" === current.href ? null : current.href) && currentResource.getAttribute("rel") === (null == current.rel ? null : current.rel) && currentResource.getAttribute("title") === (null == current.title ? null : current.title) && currentResource.getAttribute("crossorigin") === (null == current.crossOrigin ? null : current.crossOrigin)) {
                              maybeNodes.splice(i, 1);
                              break b;
                            }
                        }
                        currentResource = hoistableRoot.createElement(flags);
                        setInitialProperties(currentResource, flags, current);
                        hoistableRoot.head.appendChild(currentResource);
                        break;
                      case "meta":
                        if (maybeNodes = getHydratableHoistableCache(
                          "meta",
                          "content",
                          hoistableRoot
                        ).get(flags + (current.content || ""))) {
                          for (i = 0; i < maybeNodes.length; i++)
                            if (currentResource = maybeNodes[i], currentResource.getAttribute("content") === (null == current.content ? null : "" + current.content) && currentResource.getAttribute("name") === (null == current.name ? null : current.name) && currentResource.getAttribute("property") === (null == current.property ? null : current.property) && currentResource.getAttribute("http-equiv") === (null == current.httpEquiv ? null : current.httpEquiv) && currentResource.getAttribute("charset") === (null == current.charSet ? null : current.charSet)) {
                              maybeNodes.splice(i, 1);
                              break b;
                            }
                        }
                        currentResource = hoistableRoot.createElement(flags);
                        setInitialProperties(currentResource, flags, current);
                        hoistableRoot.head.appendChild(currentResource);
                        break;
                      default:
                        throw Error(formatProdErrorMessage(468, flags));
                    }
                    currentResource[internalInstanceKey] = finishedWork;
                    markNodeAsHoistable(currentResource);
                    flags = currentResource;
                  }
                  finishedWork.stateNode = flags;
                } else
                  mountHoistable(
                    hoistableRoot,
                    finishedWork.type,
                    finishedWork.stateNode
                  );
              else
                finishedWork.stateNode = acquireResource(
                  hoistableRoot,
                  flags,
                  finishedWork.memoizedProps
                );
            else
              currentResource !== flags ? (null === currentResource ? null !== current.stateNode && (current = current.stateNode, current.parentNode.removeChild(current)) : currentResource.count--, null === flags ? mountHoistable(
                hoistableRoot,
                finishedWork.type,
                finishedWork.stateNode
              ) : acquireResource(
                hoistableRoot,
                flags,
                finishedWork.memoizedProps
              )) : null === flags && null !== finishedWork.stateNode && commitHostUpdate(
                finishedWork,
                finishedWork.memoizedProps,
                current.memoizedProps
              );
          }
          break;
        case 27:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
          null !== current && flags & 4 && commitHostUpdate(
            finishedWork,
            finishedWork.memoizedProps,
            current.memoizedProps
          );
          break;
        case 5:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
          if (finishedWork.flags & 32) {
            hoistableRoot = finishedWork.stateNode;
            try {
              setTextContent(hoistableRoot, "");
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          flags & 4 && null != finishedWork.stateNode && (hoistableRoot = finishedWork.memoizedProps, commitHostUpdate(
            finishedWork,
            hoistableRoot,
            null !== current ? current.memoizedProps : hoistableRoot
          ));
          flags & 1024 && (needsFormReset = true);
          break;
        case 6:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          if (flags & 4) {
            if (null === finishedWork.stateNode)
              throw Error(formatProdErrorMessage(162));
            flags = finishedWork.memoizedProps;
            current = finishedWork.stateNode;
            try {
              current.nodeValue = flags;
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          break;
        case 3:
          tagCaches = null;
          hoistableRoot = currentHoistableRoot;
          currentHoistableRoot = getHoistableRoot(root2.containerInfo);
          recursivelyTraverseMutationEffects(root2, finishedWork);
          currentHoistableRoot = hoistableRoot;
          commitReconciliationEffects(finishedWork);
          if (flags & 4 && null !== current && current.memoizedState.isDehydrated)
            try {
              retryIfBlockedOn(root2.containerInfo);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          needsFormReset && (needsFormReset = false, recursivelyResetForms(finishedWork));
          break;
        case 4:
          flags = currentHoistableRoot;
          currentHoistableRoot = getHoistableRoot(
            finishedWork.stateNode.containerInfo
          );
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          currentHoistableRoot = flags;
          break;
        case 12:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          break;
        case 31:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
          break;
        case 13:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          finishedWork.child.flags & 8192 && null !== finishedWork.memoizedState !== (null !== current && null !== current.memoizedState) && (globalMostRecentFallbackTime = now());
          flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
          break;
        case 22:
          hoistableRoot = null !== finishedWork.memoizedState;
          var wasHidden = null !== current && null !== current.memoizedState, prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden, prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden || hoistableRoot;
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || wasHidden;
          recursivelyTraverseMutationEffects(root2, finishedWork);
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
          commitReconciliationEffects(finishedWork);
          if (flags & 8192)
            a: for (root2 = finishedWork.stateNode, root2._visibility = hoistableRoot ? root2._visibility & -2 : root2._visibility | 1, hoistableRoot && (null === current || wasHidden || offscreenSubtreeIsHidden || offscreenSubtreeWasHidden || recursivelyTraverseDisappearLayoutEffects(finishedWork)), current = null, root2 = finishedWork; ; ) {
              if (5 === root2.tag || 26 === root2.tag) {
                if (null === current) {
                  wasHidden = current = root2;
                  try {
                    if (currentResource = wasHidden.stateNode, hoistableRoot)
                      maybeNodes = currentResource.style, "function" === typeof maybeNodes.setProperty ? maybeNodes.setProperty("display", "none", "important") : maybeNodes.display = "none";
                    else {
                      i = wasHidden.stateNode;
                      var styleProp = wasHidden.memoizedProps.style, display = void 0 !== styleProp && null !== styleProp && styleProp.hasOwnProperty("display") ? styleProp.display : null;
                      i.style.display = null == display || "boolean" === typeof display ? "" : ("" + display).trim();
                    }
                  } catch (error) {
                    captureCommitPhaseError(wasHidden, wasHidden.return, error);
                  }
                }
              } else if (6 === root2.tag) {
                if (null === current) {
                  wasHidden = root2;
                  try {
                    wasHidden.stateNode.nodeValue = hoistableRoot ? "" : wasHidden.memoizedProps;
                  } catch (error) {
                    captureCommitPhaseError(wasHidden, wasHidden.return, error);
                  }
                }
              } else if (18 === root2.tag) {
                if (null === current) {
                  wasHidden = root2;
                  try {
                    var instance = wasHidden.stateNode;
                    hoistableRoot ? hideOrUnhideDehydratedBoundary(instance, true) : hideOrUnhideDehydratedBoundary(wasHidden.stateNode, false);
                  } catch (error) {
                    captureCommitPhaseError(wasHidden, wasHidden.return, error);
                  }
                }
              } else if ((22 !== root2.tag && 23 !== root2.tag || null === root2.memoizedState || root2 === finishedWork) && null !== root2.child) {
                root2.child.return = root2;
                root2 = root2.child;
                continue;
              }
              if (root2 === finishedWork) break a;
              for (; null === root2.sibling; ) {
                if (null === root2.return || root2.return === finishedWork) break a;
                current === root2 && (current = null);
                root2 = root2.return;
              }
              current === root2 && (current = null);
              root2.sibling.return = root2.return;
              root2 = root2.sibling;
            }
          flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (current = flags.retryQueue, null !== current && (flags.retryQueue = null, attachSuspenseRetryListeners(finishedWork, current))));
          break;
        case 19:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
          break;
        case 30:
          break;
        case 21:
          break;
        default:
          recursivelyTraverseMutationEffects(root2, finishedWork), commitReconciliationEffects(finishedWork);
      }
    }
    function commitReconciliationEffects(finishedWork) {
      var flags = finishedWork.flags;
      if (flags & 2) {
        try {
          for (var hostParentFiber, parentFiber = finishedWork.return; null !== parentFiber; ) {
            if (isHostParent(parentFiber)) {
              hostParentFiber = parentFiber;
              break;
            }
            parentFiber = parentFiber.return;
          }
          if (null == hostParentFiber) throw Error(formatProdErrorMessage(160));
          switch (hostParentFiber.tag) {
            case 27:
              var parent = hostParentFiber.stateNode, before = getHostSibling(finishedWork);
              insertOrAppendPlacementNode(finishedWork, before, parent);
              break;
            case 5:
              var parent$141 = hostParentFiber.stateNode;
              hostParentFiber.flags & 32 && (setTextContent(parent$141, ""), hostParentFiber.flags &= -33);
              var before$142 = getHostSibling(finishedWork);
              insertOrAppendPlacementNode(finishedWork, before$142, parent$141);
              break;
            case 3:
            case 4:
              var parent$143 = hostParentFiber.stateNode.containerInfo, before$144 = getHostSibling(finishedWork);
              insertOrAppendPlacementNodeIntoContainer(
                finishedWork,
                before$144,
                parent$143
              );
              break;
            default:
              throw Error(formatProdErrorMessage(161));
          }
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
        finishedWork.flags &= -3;
      }
      flags & 4096 && (finishedWork.flags &= -4097);
    }
    function recursivelyResetForms(parentFiber) {
      if (parentFiber.subtreeFlags & 1024)
        for (parentFiber = parentFiber.child; null !== parentFiber; ) {
          var fiber = parentFiber;
          recursivelyResetForms(fiber);
          5 === fiber.tag && fiber.flags & 1024 && fiber.stateNode.reset();
          parentFiber = parentFiber.sibling;
        }
    }
    function recursivelyTraverseLayoutEffects(root2, parentFiber) {
      if (parentFiber.subtreeFlags & 8772)
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          commitLayoutEffectOnFiber(root2, parentFiber.alternate, parentFiber), parentFiber = parentFiber.sibling;
    }
    function recursivelyTraverseDisappearLayoutEffects(parentFiber) {
      for (parentFiber = parentFiber.child; null !== parentFiber; ) {
        var finishedWork = parentFiber;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 14:
          case 15:
            commitHookEffectListUnmount(4, finishedWork, finishedWork.return);
            recursivelyTraverseDisappearLayoutEffects(finishedWork);
            break;
          case 1:
            safelyDetachRef(finishedWork, finishedWork.return);
            var instance = finishedWork.stateNode;
            "function" === typeof instance.componentWillUnmount && safelyCallComponentWillUnmount(
              finishedWork,
              finishedWork.return,
              instance
            );
            recursivelyTraverseDisappearLayoutEffects(finishedWork);
            break;
          case 27:
            releaseSingletonInstance(finishedWork.stateNode);
          case 26:
          case 5:
            safelyDetachRef(finishedWork, finishedWork.return);
            recursivelyTraverseDisappearLayoutEffects(finishedWork);
            break;
          case 22:
            null === finishedWork.memoizedState && recursivelyTraverseDisappearLayoutEffects(finishedWork);
            break;
          case 30:
            recursivelyTraverseDisappearLayoutEffects(finishedWork);
            break;
          default:
            recursivelyTraverseDisappearLayoutEffects(finishedWork);
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function recursivelyTraverseReappearLayoutEffects(finishedRoot$jscomp$0, parentFiber, includeWorkInProgressEffects) {
      includeWorkInProgressEffects = includeWorkInProgressEffects && 0 !== (parentFiber.subtreeFlags & 8772);
      for (parentFiber = parentFiber.child; null !== parentFiber; ) {
        var current = parentFiber.alternate, finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 15:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              includeWorkInProgressEffects
            );
            commitHookEffectListMount(4, finishedWork);
            break;
          case 1:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              includeWorkInProgressEffects
            );
            current = finishedWork;
            finishedRoot = current.stateNode;
            if ("function" === typeof finishedRoot.componentDidMount)
              try {
                finishedRoot.componentDidMount();
              } catch (error) {
                captureCommitPhaseError(current, current.return, error);
              }
            current = finishedWork;
            finishedRoot = current.updateQueue;
            if (null !== finishedRoot) {
              var instance = current.stateNode;
              try {
                var hiddenCallbacks = finishedRoot.shared.hiddenCallbacks;
                if (null !== hiddenCallbacks)
                  for (finishedRoot.shared.hiddenCallbacks = null, finishedRoot = 0; finishedRoot < hiddenCallbacks.length; finishedRoot++)
                    callCallback(hiddenCallbacks[finishedRoot], instance);
              } catch (error) {
                captureCommitPhaseError(current, current.return, error);
              }
            }
            includeWorkInProgressEffects && flags & 64 && commitClassCallbacks(finishedWork);
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 27:
            commitHostSingletonAcquisition(finishedWork);
          case 26:
          case 5:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              includeWorkInProgressEffects
            );
            includeWorkInProgressEffects && null === current && flags & 4 && commitHostMount(finishedWork);
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 12:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              includeWorkInProgressEffects
            );
            break;
          case 31:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              includeWorkInProgressEffects
            );
            includeWorkInProgressEffects && flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
            break;
          case 13:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              includeWorkInProgressEffects
            );
            includeWorkInProgressEffects && flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
            break;
          case 22:
            null === finishedWork.memoizedState && recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              includeWorkInProgressEffects
            );
            safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 30:
            break;
          default:
            recursivelyTraverseReappearLayoutEffects(
              finishedRoot,
              finishedWork,
              includeWorkInProgressEffects
            );
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function commitOffscreenPassiveMountEffects(current, finishedWork) {
      var previousCache = null;
      null !== current && null !== current.memoizedState && null !== current.memoizedState.cachePool && (previousCache = current.memoizedState.cachePool.pool);
      current = null;
      null !== finishedWork.memoizedState && null !== finishedWork.memoizedState.cachePool && (current = finishedWork.memoizedState.cachePool.pool);
      current !== previousCache && (null != current && current.refCount++, null != previousCache && releaseCache(previousCache));
    }
    function commitCachePassiveMountEffect(current, finishedWork) {
      current = null;
      null !== finishedWork.alternate && (current = finishedWork.alternate.memoizedState.cache);
      finishedWork = finishedWork.memoizedState.cache;
      finishedWork !== current && (finishedWork.refCount++, null != current && releaseCache(current));
    }
    function recursivelyTraversePassiveMountEffects(root2, parentFiber, committedLanes, committedTransitions) {
      if (parentFiber.subtreeFlags & 10256)
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          commitPassiveMountOnFiber(
            root2,
            parentFiber,
            committedLanes,
            committedTransitions
          ), parentFiber = parentFiber.sibling;
    }
    function commitPassiveMountOnFiber(finishedRoot, finishedWork, committedLanes, committedTransitions) {
      var flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          flags & 2048 && commitHookEffectListMount(9, finishedWork);
          break;
        case 1:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          break;
        case 3:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          flags & 2048 && (finishedRoot = null, null !== finishedWork.alternate && (finishedRoot = finishedWork.alternate.memoizedState.cache), finishedWork = finishedWork.memoizedState.cache, finishedWork !== finishedRoot && (finishedWork.refCount++, null != finishedRoot && releaseCache(finishedRoot)));
          break;
        case 12:
          if (flags & 2048) {
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
            finishedRoot = finishedWork.stateNode;
            try {
              var _finishedWork$memoize2 = finishedWork.memoizedProps, id = _finishedWork$memoize2.id, onPostCommit = _finishedWork$memoize2.onPostCommit;
              "function" === typeof onPostCommit && onPostCommit(
                id,
                null === finishedWork.alternate ? "mount" : "update",
                finishedRoot.passiveEffectDuration,
                -0
              );
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          } else
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
          break;
        case 31:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          break;
        case 13:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          break;
        case 23:
          break;
        case 22:
          _finishedWork$memoize2 = finishedWork.stateNode;
          id = finishedWork.alternate;
          null !== finishedWork.memoizedState ? _finishedWork$memoize2._visibility & 2 ? recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          ) : recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork) : _finishedWork$memoize2._visibility & 2 ? recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          ) : (_finishedWork$memoize2._visibility |= 2, recursivelyTraverseReconnectPassiveEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions,
            0 !== (finishedWork.subtreeFlags & 10256) || false
          ));
          flags & 2048 && commitOffscreenPassiveMountEffects(id, finishedWork);
          break;
        case 24:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
          flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
          break;
        default:
          recursivelyTraversePassiveMountEffects(
            finishedRoot,
            finishedWork,
            committedLanes,
            committedTransitions
          );
      }
    }
    function recursivelyTraverseReconnectPassiveEffects(finishedRoot$jscomp$0, parentFiber, committedLanes$jscomp$0, committedTransitions$jscomp$0, includeWorkInProgressEffects) {
      includeWorkInProgressEffects = includeWorkInProgressEffects && (0 !== (parentFiber.subtreeFlags & 10256) || false);
      for (parentFiber = parentFiber.child; null !== parentFiber; ) {
        var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, committedLanes = committedLanes$jscomp$0, committedTransitions = committedTransitions$jscomp$0, flags = finishedWork.flags;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 15:
            recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects
            );
            commitHookEffectListMount(8, finishedWork);
            break;
          case 23:
            break;
          case 22:
            var instance = finishedWork.stateNode;
            null !== finishedWork.memoizedState ? instance._visibility & 2 ? recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects
            ) : recursivelyTraverseAtomicPassiveEffects(
              finishedRoot,
              finishedWork
            ) : (instance._visibility |= 2, recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects
            ));
            includeWorkInProgressEffects && flags & 2048 && commitOffscreenPassiveMountEffects(
              finishedWork.alternate,
              finishedWork
            );
            break;
          case 24:
            recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects
            );
            includeWorkInProgressEffects && flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
            break;
          default:
            recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              includeWorkInProgressEffects
            );
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function recursivelyTraverseAtomicPassiveEffects(finishedRoot$jscomp$0, parentFiber) {
      if (parentFiber.subtreeFlags & 10256)
        for (parentFiber = parentFiber.child; null !== parentFiber; ) {
          var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
          switch (finishedWork.tag) {
            case 22:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
              flags & 2048 && commitOffscreenPassiveMountEffects(
                finishedWork.alternate,
                finishedWork
              );
              break;
            case 24:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
              flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
              break;
            default:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
          }
          parentFiber = parentFiber.sibling;
        }
    }
    var suspenseyCommitFlag = 8192;
    function recursivelyAccumulateSuspenseyCommit(parentFiber, committedLanes, suspendedState) {
      if (parentFiber.subtreeFlags & suspenseyCommitFlag)
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          accumulateSuspenseyCommitOnFiber(
            parentFiber,
            committedLanes,
            suspendedState
          ), parentFiber = parentFiber.sibling;
    }
    function accumulateSuspenseyCommitOnFiber(fiber, committedLanes, suspendedState) {
      switch (fiber.tag) {
        case 26:
          recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          );
          fiber.flags & suspenseyCommitFlag && null !== fiber.memoizedState && suspendResource(
            suspendedState,
            currentHoistableRoot,
            fiber.memoizedState,
            fiber.memoizedProps
          );
          break;
        case 5:
          recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          );
          break;
        case 3:
        case 4:
          var previousHoistableRoot = currentHoistableRoot;
          currentHoistableRoot = getHoistableRoot(fiber.stateNode.containerInfo);
          recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          );
          currentHoistableRoot = previousHoistableRoot;
          break;
        case 22:
          null === fiber.memoizedState && (previousHoistableRoot = fiber.alternate, null !== previousHoistableRoot && null !== previousHoistableRoot.memoizedState ? (previousHoistableRoot = suspenseyCommitFlag, suspenseyCommitFlag = 16777216, recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          ), suspenseyCommitFlag = previousHoistableRoot) : recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          ));
          break;
        default:
          recursivelyAccumulateSuspenseyCommit(
            fiber,
            committedLanes,
            suspendedState
          );
      }
    }
    function detachAlternateSiblings(parentFiber) {
      var previousFiber = parentFiber.alternate;
      if (null !== previousFiber && (parentFiber = previousFiber.child, null !== parentFiber)) {
        previousFiber.child = null;
        do
          previousFiber = parentFiber.sibling, parentFiber.sibling = null, parentFiber = previousFiber;
        while (null !== parentFiber);
      }
    }
    function recursivelyTraversePassiveUnmountEffects(parentFiber) {
      var deletions = parentFiber.deletions;
      if (0 !== (parentFiber.flags & 16)) {
        if (null !== deletions)
          for (var i = 0; i < deletions.length; i++) {
            var childToDelete = deletions[i];
            nextEffect = childToDelete;
            commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
              childToDelete,
              parentFiber
            );
          }
        detachAlternateSiblings(parentFiber);
      }
      if (parentFiber.subtreeFlags & 10256)
        for (parentFiber = parentFiber.child; null !== parentFiber; )
          commitPassiveUnmountOnFiber(parentFiber), parentFiber = parentFiber.sibling;
    }
    function commitPassiveUnmountOnFiber(finishedWork) {
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          finishedWork.flags & 2048 && commitHookEffectListUnmount(9, finishedWork, finishedWork.return);
          break;
        case 3:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          break;
        case 12:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          break;
        case 22:
          var instance = finishedWork.stateNode;
          null !== finishedWork.memoizedState && instance._visibility & 2 && (null === finishedWork.return || 13 !== finishedWork.return.tag) ? (instance._visibility &= -3, recursivelyTraverseDisconnectPassiveEffects(finishedWork)) : recursivelyTraversePassiveUnmountEffects(finishedWork);
          break;
        default:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
      }
    }
    function recursivelyTraverseDisconnectPassiveEffects(parentFiber) {
      var deletions = parentFiber.deletions;
      if (0 !== (parentFiber.flags & 16)) {
        if (null !== deletions)
          for (var i = 0; i < deletions.length; i++) {
            var childToDelete = deletions[i];
            nextEffect = childToDelete;
            commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
              childToDelete,
              parentFiber
            );
          }
        detachAlternateSiblings(parentFiber);
      }
      for (parentFiber = parentFiber.child; null !== parentFiber; ) {
        deletions = parentFiber;
        switch (deletions.tag) {
          case 0:
          case 11:
          case 15:
            commitHookEffectListUnmount(8, deletions, deletions.return);
            recursivelyTraverseDisconnectPassiveEffects(deletions);
            break;
          case 22:
            i = deletions.stateNode;
            i._visibility & 2 && (i._visibility &= -3, recursivelyTraverseDisconnectPassiveEffects(deletions));
            break;
          default:
            recursivelyTraverseDisconnectPassiveEffects(deletions);
        }
        parentFiber = parentFiber.sibling;
      }
    }
    function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(deletedSubtreeRoot, nearestMountedAncestor) {
      for (; null !== nextEffect; ) {
        var fiber = nextEffect;
        switch (fiber.tag) {
          case 0:
          case 11:
          case 15:
            commitHookEffectListUnmount(8, fiber, nearestMountedAncestor);
            break;
          case 23:
          case 22:
            if (null !== fiber.memoizedState && null !== fiber.memoizedState.cachePool) {
              var cache = fiber.memoizedState.cachePool.pool;
              null != cache && cache.refCount++;
            }
            break;
          case 24:
            releaseCache(fiber.memoizedState.cache);
        }
        cache = fiber.child;
        if (null !== cache) cache.return = fiber, nextEffect = cache;
        else
          a: for (fiber = deletedSubtreeRoot; null !== nextEffect; ) {
            cache = nextEffect;
            var sibling = cache.sibling, returnFiber = cache.return;
            detachFiberAfterEffects(cache);
            if (cache === fiber) {
              nextEffect = null;
              break a;
            }
            if (null !== sibling) {
              sibling.return = returnFiber;
              nextEffect = sibling;
              break a;
            }
            nextEffect = returnFiber;
          }
      }
    }
    var DefaultAsyncDispatcher = {
      getCacheForType: function(resourceType) {
        var cache = readContext(CacheContext), cacheForType = cache.data.get(resourceType);
        void 0 === cacheForType && (cacheForType = resourceType(), cache.data.set(resourceType, cacheForType));
        return cacheForType;
      },
      cacheSignal: function() {
        return readContext(CacheContext).controller.signal;
      }
    };
    var PossiblyWeakMap = "function" === typeof WeakMap ? WeakMap : Map;
    var executionContext = 0;
    var workInProgressRoot = null;
    var workInProgress = null;
    var workInProgressRootRenderLanes = 0;
    var workInProgressSuspendedReason = 0;
    var workInProgressThrownValue = null;
    var workInProgressRootDidSkipSuspendedSiblings = false;
    var workInProgressRootIsPrerendering = false;
    var workInProgressRootDidAttachPingListener = false;
    var entangledRenderLanes = 0;
    var workInProgressRootExitStatus = 0;
    var workInProgressRootSkippedLanes = 0;
    var workInProgressRootInterleavedUpdatedLanes = 0;
    var workInProgressRootPingedLanes = 0;
    var workInProgressDeferredLane = 0;
    var workInProgressSuspendedRetryLanes = 0;
    var workInProgressRootConcurrentErrors = null;
    var workInProgressRootRecoverableErrors = null;
    var workInProgressRootDidIncludeRecursiveRenderUpdate = false;
    var globalMostRecentFallbackTime = 0;
    var globalMostRecentTransitionTime = 0;
    var workInProgressRootRenderTargetTime = Infinity;
    var workInProgressTransitions = null;
    var legacyErrorBoundariesThatAlreadyFailed = null;
    var pendingEffectsStatus = 0;
    var pendingEffectsRoot = null;
    var pendingFinishedWork = null;
    var pendingEffectsLanes = 0;
    var pendingEffectsRemainingLanes = 0;
    var pendingPassiveTransitions = null;
    var pendingRecoverableErrors = null;
    var nestedUpdateCount = 0;
    var rootWithNestedUpdates = null;
    function requestUpdateLane() {
      return 0 !== (executionContext & 2) && 0 !== workInProgressRootRenderLanes ? workInProgressRootRenderLanes & -workInProgressRootRenderLanes : null !== ReactSharedInternals.T ? requestTransitionLane() : resolveUpdatePriority();
    }
    function requestDeferredLane() {
      if (0 === workInProgressDeferredLane)
        if (0 === (workInProgressRootRenderLanes & 536870912) || isHydrating) {
          var lane = nextTransitionDeferredLane;
          nextTransitionDeferredLane <<= 1;
          0 === (nextTransitionDeferredLane & 3932160) && (nextTransitionDeferredLane = 262144);
          workInProgressDeferredLane = lane;
        } else workInProgressDeferredLane = 536870912;
      lane = suspenseHandlerStackCursor.current;
      null !== lane && (lane.flags |= 32);
      return workInProgressDeferredLane;
    }
    function scheduleUpdateOnFiber(root2, fiber, lane) {
      if (root2 === workInProgressRoot && (2 === workInProgressSuspendedReason || 9 === workInProgressSuspendedReason) || null !== root2.cancelPendingCommit)
        prepareFreshStack(root2, 0), markRootSuspended(
          root2,
          workInProgressRootRenderLanes,
          workInProgressDeferredLane,
          false
        );
      markRootUpdated$1(root2, lane);
      if (0 === (executionContext & 2) || root2 !== workInProgressRoot)
        root2 === workInProgressRoot && (0 === (executionContext & 2) && (workInProgressRootInterleavedUpdatedLanes |= lane), 4 === workInProgressRootExitStatus && markRootSuspended(
          root2,
          workInProgressRootRenderLanes,
          workInProgressDeferredLane,
          false
        )), ensureRootIsScheduled(root2);
    }
    function performWorkOnRoot(root$jscomp$0, lanes, forceSync) {
      if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(327));
      var shouldTimeSlice = !forceSync && 0 === (lanes & 127) && 0 === (lanes & root$jscomp$0.expiredLanes) || checkIfRootIsPrerendering(root$jscomp$0, lanes), exitStatus = shouldTimeSlice ? renderRootConcurrent(root$jscomp$0, lanes) : renderRootSync(root$jscomp$0, lanes, true), renderWasConcurrent = shouldTimeSlice;
      do {
        if (0 === exitStatus) {
          workInProgressRootIsPrerendering && !shouldTimeSlice && markRootSuspended(root$jscomp$0, lanes, 0, false);
          break;
        } else {
          forceSync = root$jscomp$0.current.alternate;
          if (renderWasConcurrent && !isRenderConsistentWithExternalStores(forceSync)) {
            exitStatus = renderRootSync(root$jscomp$0, lanes, false);
            renderWasConcurrent = false;
            continue;
          }
          if (2 === exitStatus) {
            renderWasConcurrent = lanes;
            if (root$jscomp$0.errorRecoveryDisabledLanes & renderWasConcurrent)
              var JSCompiler_inline_result = 0;
            else
              JSCompiler_inline_result = root$jscomp$0.pendingLanes & -536870913, JSCompiler_inline_result = 0 !== JSCompiler_inline_result ? JSCompiler_inline_result : JSCompiler_inline_result & 536870912 ? 536870912 : 0;
            if (0 !== JSCompiler_inline_result) {
              lanes = JSCompiler_inline_result;
              a: {
                var root2 = root$jscomp$0;
                exitStatus = workInProgressRootConcurrentErrors;
                var wasRootDehydrated = root2.current.memoizedState.isDehydrated;
                wasRootDehydrated && (prepareFreshStack(root2, JSCompiler_inline_result).flags |= 256);
                JSCompiler_inline_result = renderRootSync(
                  root2,
                  JSCompiler_inline_result,
                  false
                );
                if (2 !== JSCompiler_inline_result) {
                  if (workInProgressRootDidAttachPingListener && !wasRootDehydrated) {
                    root2.errorRecoveryDisabledLanes |= renderWasConcurrent;
                    workInProgressRootInterleavedUpdatedLanes |= renderWasConcurrent;
                    exitStatus = 4;
                    break a;
                  }
                  renderWasConcurrent = workInProgressRootRecoverableErrors;
                  workInProgressRootRecoverableErrors = exitStatus;
                  null !== renderWasConcurrent && (null === workInProgressRootRecoverableErrors ? workInProgressRootRecoverableErrors = renderWasConcurrent : workInProgressRootRecoverableErrors.push.apply(
                    workInProgressRootRecoverableErrors,
                    renderWasConcurrent
                  ));
                }
                exitStatus = JSCompiler_inline_result;
              }
              renderWasConcurrent = false;
              if (2 !== exitStatus) continue;
            }
          }
          if (1 === exitStatus) {
            prepareFreshStack(root$jscomp$0, 0);
            markRootSuspended(root$jscomp$0, lanes, 0, true);
            break;
          }
          a: {
            shouldTimeSlice = root$jscomp$0;
            renderWasConcurrent = exitStatus;
            switch (renderWasConcurrent) {
              case 0:
              case 1:
                throw Error(formatProdErrorMessage(345));
              case 4:
                if ((lanes & 4194048) !== lanes) break;
              case 6:
                markRootSuspended(
                  shouldTimeSlice,
                  lanes,
                  workInProgressDeferredLane,
                  !workInProgressRootDidSkipSuspendedSiblings
                );
                break a;
              case 2:
                workInProgressRootRecoverableErrors = null;
                break;
              case 3:
              case 5:
                break;
              default:
                throw Error(formatProdErrorMessage(329));
            }
            if ((lanes & 62914560) === lanes && (exitStatus = globalMostRecentFallbackTime + 300 - now(), 10 < exitStatus)) {
              markRootSuspended(
                shouldTimeSlice,
                lanes,
                workInProgressDeferredLane,
                !workInProgressRootDidSkipSuspendedSiblings
              );
              if (0 !== getNextLanes(shouldTimeSlice, 0, true)) break a;
              pendingEffectsLanes = lanes;
              shouldTimeSlice.timeoutHandle = scheduleTimeout(
                commitRootWhenReady.bind(
                  null,
                  shouldTimeSlice,
                  forceSync,
                  workInProgressRootRecoverableErrors,
                  workInProgressTransitions,
                  workInProgressRootDidIncludeRecursiveRenderUpdate,
                  lanes,
                  workInProgressDeferredLane,
                  workInProgressRootInterleavedUpdatedLanes,
                  workInProgressSuspendedRetryLanes,
                  workInProgressRootDidSkipSuspendedSiblings,
                  renderWasConcurrent,
                  "Throttled",
                  -0,
                  0
                ),
                exitStatus
              );
              break a;
            }
            commitRootWhenReady(
              shouldTimeSlice,
              forceSync,
              workInProgressRootRecoverableErrors,
              workInProgressTransitions,
              workInProgressRootDidIncludeRecursiveRenderUpdate,
              lanes,
              workInProgressDeferredLane,
              workInProgressRootInterleavedUpdatedLanes,
              workInProgressSuspendedRetryLanes,
              workInProgressRootDidSkipSuspendedSiblings,
              renderWasConcurrent,
              null,
              -0,
              0
            );
          }
        }
        break;
      } while (1);
      ensureRootIsScheduled(root$jscomp$0);
    }
    function commitRootWhenReady(root2, finishedWork, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, lanes, spawnedLane, updatedLanes, suspendedRetryLanes, didSkipSuspendedSiblings, exitStatus, suspendedCommitReason, completedRenderStartTime, completedRenderEndTime) {
      root2.timeoutHandle = -1;
      suspendedCommitReason = finishedWork.subtreeFlags;
      if (suspendedCommitReason & 8192 || 16785408 === (suspendedCommitReason & 16785408)) {
        suspendedCommitReason = {
          stylesheets: null,
          count: 0,
          imgCount: 0,
          imgBytes: 0,
          suspenseyImages: [],
          waitingForImages: true,
          waitingForViewTransition: false,
          unsuspend: noop$1
        };
        accumulateSuspenseyCommitOnFiber(
          finishedWork,
          lanes,
          suspendedCommitReason
        );
        var timeoutOffset = (lanes & 62914560) === lanes ? globalMostRecentFallbackTime - now() : (lanes & 4194048) === lanes ? globalMostRecentTransitionTime - now() : 0;
        timeoutOffset = waitForCommitToBeReady(
          suspendedCommitReason,
          timeoutOffset
        );
        if (null !== timeoutOffset) {
          pendingEffectsLanes = lanes;
          root2.cancelPendingCommit = timeoutOffset(
            commitRoot.bind(
              null,
              root2,
              finishedWork,
              lanes,
              recoverableErrors,
              transitions,
              didIncludeRenderPhaseUpdate,
              spawnedLane,
              updatedLanes,
              suspendedRetryLanes,
              exitStatus,
              suspendedCommitReason,
              null,
              completedRenderStartTime,
              completedRenderEndTime
            )
          );
          markRootSuspended(root2, lanes, spawnedLane, !didSkipSuspendedSiblings);
          return;
        }
      }
      commitRoot(
        root2,
        finishedWork,
        lanes,
        recoverableErrors,
        transitions,
        didIncludeRenderPhaseUpdate,
        spawnedLane,
        updatedLanes,
        suspendedRetryLanes
      );
    }
    function isRenderConsistentWithExternalStores(finishedWork) {
      for (var node = finishedWork; ; ) {
        var tag = node.tag;
        if ((0 === tag || 11 === tag || 15 === tag) && node.flags & 16384 && (tag = node.updateQueue, null !== tag && (tag = tag.stores, null !== tag)))
          for (var i = 0; i < tag.length; i++) {
            var check = tag[i], getSnapshot = check.getSnapshot;
            check = check.value;
            try {
              if (!objectIs(getSnapshot(), check)) return false;
            } catch (error) {
              return false;
            }
          }
        tag = node.child;
        if (node.subtreeFlags & 16384 && null !== tag)
          tag.return = node, node = tag;
        else {
          if (node === finishedWork) break;
          for (; null === node.sibling; ) {
            if (null === node.return || node.return === finishedWork) return true;
            node = node.return;
          }
          node.sibling.return = node.return;
          node = node.sibling;
        }
      }
      return true;
    }
    function markRootSuspended(root2, suspendedLanes, spawnedLane, didAttemptEntireTree) {
      suspendedLanes &= ~workInProgressRootPingedLanes;
      suspendedLanes &= ~workInProgressRootInterleavedUpdatedLanes;
      root2.suspendedLanes |= suspendedLanes;
      root2.pingedLanes &= ~suspendedLanes;
      didAttemptEntireTree && (root2.warmLanes |= suspendedLanes);
      didAttemptEntireTree = root2.expirationTimes;
      for (var lanes = suspendedLanes; 0 < lanes; ) {
        var index$6 = 31 - clz32(lanes), lane = 1 << index$6;
        didAttemptEntireTree[index$6] = -1;
        lanes &= ~lane;
      }
      0 !== spawnedLane && markSpawnedDeferredLane(root2, spawnedLane, suspendedLanes);
    }
    function flushSyncWork$1() {
      return 0 === (executionContext & 6) ? (flushSyncWorkAcrossRoots_impl(0, false), false) : true;
    }
    function resetWorkInProgressStack() {
      if (null !== workInProgress) {
        if (0 === workInProgressSuspendedReason)
          var interruptedWork = workInProgress.return;
        else
          interruptedWork = workInProgress, lastContextDependency = currentlyRenderingFiber$1 = null, resetHooksOnUnwind(interruptedWork), thenableState$1 = null, thenableIndexCounter$1 = 0, interruptedWork = workInProgress;
        for (; null !== interruptedWork; )
          unwindInterruptedWork(interruptedWork.alternate, interruptedWork), interruptedWork = interruptedWork.return;
        workInProgress = null;
      }
    }
    function prepareFreshStack(root2, lanes) {
      var timeoutHandle = root2.timeoutHandle;
      -1 !== timeoutHandle && (root2.timeoutHandle = -1, cancelTimeout(timeoutHandle));
      timeoutHandle = root2.cancelPendingCommit;
      null !== timeoutHandle && (root2.cancelPendingCommit = null, timeoutHandle());
      pendingEffectsLanes = 0;
      resetWorkInProgressStack();
      workInProgressRoot = root2;
      workInProgress = timeoutHandle = createWorkInProgress(root2.current, null);
      workInProgressRootRenderLanes = lanes;
      workInProgressSuspendedReason = 0;
      workInProgressThrownValue = null;
      workInProgressRootDidSkipSuspendedSiblings = false;
      workInProgressRootIsPrerendering = checkIfRootIsPrerendering(root2, lanes);
      workInProgressRootDidAttachPingListener = false;
      workInProgressSuspendedRetryLanes = workInProgressDeferredLane = workInProgressRootPingedLanes = workInProgressRootInterleavedUpdatedLanes = workInProgressRootSkippedLanes = workInProgressRootExitStatus = 0;
      workInProgressRootRecoverableErrors = workInProgressRootConcurrentErrors = null;
      workInProgressRootDidIncludeRecursiveRenderUpdate = false;
      0 !== (lanes & 8) && (lanes |= lanes & 32);
      var allEntangledLanes = root2.entangledLanes;
      if (0 !== allEntangledLanes)
        for (root2 = root2.entanglements, allEntangledLanes &= lanes; 0 < allEntangledLanes; ) {
          var index$4 = 31 - clz32(allEntangledLanes), lane = 1 << index$4;
          lanes |= root2[index$4];
          allEntangledLanes &= ~lane;
        }
      entangledRenderLanes = lanes;
      finishQueueingConcurrentUpdates();
      return timeoutHandle;
    }
    function handleThrow(root2, thrownValue) {
      currentlyRenderingFiber = null;
      ReactSharedInternals.H = ContextOnlyDispatcher;
      thrownValue === SuspenseException || thrownValue === SuspenseActionException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 3) : thrownValue === SuspenseyCommitException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 4) : workInProgressSuspendedReason = thrownValue === SelectiveHydrationException ? 8 : null !== thrownValue && "object" === typeof thrownValue && "function" === typeof thrownValue.then ? 6 : 1;
      workInProgressThrownValue = thrownValue;
      null === workInProgress && (workInProgressRootExitStatus = 1, logUncaughtError(
        root2,
        createCapturedValueAtFiber(thrownValue, root2.current)
      ));
    }
    function shouldRemainOnPreviousScreen() {
      var handler = suspenseHandlerStackCursor.current;
      return null === handler ? true : (workInProgressRootRenderLanes & 4194048) === workInProgressRootRenderLanes ? null === shellBoundary ? true : false : (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes || 0 !== (workInProgressRootRenderLanes & 536870912) ? handler === shellBoundary : false;
    }
    function pushDispatcher() {
      var prevDispatcher = ReactSharedInternals.H;
      ReactSharedInternals.H = ContextOnlyDispatcher;
      return null === prevDispatcher ? ContextOnlyDispatcher : prevDispatcher;
    }
    function pushAsyncDispatcher() {
      var prevAsyncDispatcher = ReactSharedInternals.A;
      ReactSharedInternals.A = DefaultAsyncDispatcher;
      return prevAsyncDispatcher;
    }
    function renderDidSuspendDelayIfPossible() {
      workInProgressRootExitStatus = 4;
      workInProgressRootDidSkipSuspendedSiblings || (workInProgressRootRenderLanes & 4194048) !== workInProgressRootRenderLanes && null !== suspenseHandlerStackCursor.current || (workInProgressRootIsPrerendering = true);
      0 === (workInProgressRootSkippedLanes & 134217727) && 0 === (workInProgressRootInterleavedUpdatedLanes & 134217727) || null === workInProgressRoot || markRootSuspended(
        workInProgressRoot,
        workInProgressRootRenderLanes,
        workInProgressDeferredLane,
        false
      );
    }
    function renderRootSync(root2, lanes, shouldYieldForPrerendering) {
      var prevExecutionContext = executionContext;
      executionContext |= 2;
      var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
      if (workInProgressRoot !== root2 || workInProgressRootRenderLanes !== lanes)
        workInProgressTransitions = null, prepareFreshStack(root2, lanes);
      lanes = false;
      var exitStatus = workInProgressRootExitStatus;
      a: do
        try {
          if (0 !== workInProgressSuspendedReason && null !== workInProgress) {
            var unitOfWork = workInProgress, thrownValue = workInProgressThrownValue;
            switch (workInProgressSuspendedReason) {
              case 8:
                resetWorkInProgressStack();
                exitStatus = 6;
                break a;
              case 3:
              case 2:
              case 9:
              case 6:
                null === suspenseHandlerStackCursor.current && (lanes = true);
                var reason = workInProgressSuspendedReason;
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, reason);
                if (shouldYieldForPrerendering && workInProgressRootIsPrerendering) {
                  exitStatus = 0;
                  break a;
                }
                break;
              default:
                reason = workInProgressSuspendedReason, workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, reason);
            }
          }
          workLoopSync();
          exitStatus = workInProgressRootExitStatus;
          break;
        } catch (thrownValue$165) {
          handleThrow(root2, thrownValue$165);
        }
      while (1);
      lanes && root2.shellSuspendCounter++;
      lastContextDependency = currentlyRenderingFiber$1 = null;
      executionContext = prevExecutionContext;
      ReactSharedInternals.H = prevDispatcher;
      ReactSharedInternals.A = prevAsyncDispatcher;
      null === workInProgress && (workInProgressRoot = null, workInProgressRootRenderLanes = 0, finishQueueingConcurrentUpdates());
      return exitStatus;
    }
    function workLoopSync() {
      for (; null !== workInProgress; ) performUnitOfWork(workInProgress);
    }
    function renderRootConcurrent(root2, lanes) {
      var prevExecutionContext = executionContext;
      executionContext |= 2;
      var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
      workInProgressRoot !== root2 || workInProgressRootRenderLanes !== lanes ? (workInProgressTransitions = null, workInProgressRootRenderTargetTime = now() + 500, prepareFreshStack(root2, lanes)) : workInProgressRootIsPrerendering = checkIfRootIsPrerendering(
        root2,
        lanes
      );
      a: do
        try {
          if (0 !== workInProgressSuspendedReason && null !== workInProgress) {
            lanes = workInProgress;
            var thrownValue = workInProgressThrownValue;
            b: switch (workInProgressSuspendedReason) {
              case 1:
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, lanes, thrownValue, 1);
                break;
              case 2:
              case 9:
                if (isThenableResolved(thrownValue)) {
                  workInProgressSuspendedReason = 0;
                  workInProgressThrownValue = null;
                  replaySuspendedUnitOfWork(lanes);
                  break;
                }
                lanes = function() {
                  2 !== workInProgressSuspendedReason && 9 !== workInProgressSuspendedReason || workInProgressRoot !== root2 || (workInProgressSuspendedReason = 7);
                  ensureRootIsScheduled(root2);
                };
                thrownValue.then(lanes, lanes);
                break a;
              case 3:
                workInProgressSuspendedReason = 7;
                break a;
              case 4:
                workInProgressSuspendedReason = 5;
                break a;
              case 7:
                isThenableResolved(thrownValue) ? (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, replaySuspendedUnitOfWork(lanes)) : (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root2, lanes, thrownValue, 7));
                break;
              case 5:
                var resource = null;
                switch (workInProgress.tag) {
                  case 26:
                    resource = workInProgress.memoizedState;
                  case 5:
                  case 27:
                    var hostFiber = workInProgress;
                    if (resource ? preloadResource(resource) : hostFiber.stateNode.complete) {
                      workInProgressSuspendedReason = 0;
                      workInProgressThrownValue = null;
                      var sibling = hostFiber.sibling;
                      if (null !== sibling) workInProgress = sibling;
                      else {
                        var returnFiber = hostFiber.return;
                        null !== returnFiber ? (workInProgress = returnFiber, completeUnitOfWork(returnFiber)) : workInProgress = null;
                      }
                      break b;
                    }
                }
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, lanes, thrownValue, 5);
                break;
              case 6:
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, lanes, thrownValue, 6);
                break;
              case 8:
                resetWorkInProgressStack();
                workInProgressRootExitStatus = 6;
                break a;
              default:
                throw Error(formatProdErrorMessage(462));
            }
          }
          workLoopConcurrentByScheduler();
          break;
        } catch (thrownValue$167) {
          handleThrow(root2, thrownValue$167);
        }
      while (1);
      lastContextDependency = currentlyRenderingFiber$1 = null;
      ReactSharedInternals.H = prevDispatcher;
      ReactSharedInternals.A = prevAsyncDispatcher;
      executionContext = prevExecutionContext;
      if (null !== workInProgress) return 0;
      workInProgressRoot = null;
      workInProgressRootRenderLanes = 0;
      finishQueueingConcurrentUpdates();
      return workInProgressRootExitStatus;
    }
    function workLoopConcurrentByScheduler() {
      for (; null !== workInProgress && !shouldYield(); )
        performUnitOfWork(workInProgress);
    }
    function performUnitOfWork(unitOfWork) {
      var next = beginWork(unitOfWork.alternate, unitOfWork, entangledRenderLanes);
      unitOfWork.memoizedProps = unitOfWork.pendingProps;
      null === next ? completeUnitOfWork(unitOfWork) : workInProgress = next;
    }
    function replaySuspendedUnitOfWork(unitOfWork) {
      var next = unitOfWork;
      var current = next.alternate;
      switch (next.tag) {
        case 15:
        case 0:
          next = replayFunctionComponent(
            current,
            next,
            next.pendingProps,
            next.type,
            void 0,
            workInProgressRootRenderLanes
          );
          break;
        case 11:
          next = replayFunctionComponent(
            current,
            next,
            next.pendingProps,
            next.type.render,
            next.ref,
            workInProgressRootRenderLanes
          );
          break;
        case 5:
          resetHooksOnUnwind(next);
        default:
          unwindInterruptedWork(current, next), next = workInProgress = resetWorkInProgress(next, entangledRenderLanes), next = beginWork(current, next, entangledRenderLanes);
      }
      unitOfWork.memoizedProps = unitOfWork.pendingProps;
      null === next ? completeUnitOfWork(unitOfWork) : workInProgress = next;
    }
    function throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, suspendedReason) {
      lastContextDependency = currentlyRenderingFiber$1 = null;
      resetHooksOnUnwind(unitOfWork);
      thenableState$1 = null;
      thenableIndexCounter$1 = 0;
      var returnFiber = unitOfWork.return;
      try {
        if (throwException(
          root2,
          returnFiber,
          unitOfWork,
          thrownValue,
          workInProgressRootRenderLanes
        )) {
          workInProgressRootExitStatus = 1;
          logUncaughtError(
            root2,
            createCapturedValueAtFiber(thrownValue, root2.current)
          );
          workInProgress = null;
          return;
        }
      } catch (error) {
        if (null !== returnFiber) throw workInProgress = returnFiber, error;
        workInProgressRootExitStatus = 1;
        logUncaughtError(
          root2,
          createCapturedValueAtFiber(thrownValue, root2.current)
        );
        workInProgress = null;
        return;
      }
      if (unitOfWork.flags & 32768) {
        if (isHydrating || 1 === suspendedReason) root2 = true;
        else if (workInProgressRootIsPrerendering || 0 !== (workInProgressRootRenderLanes & 536870912))
          root2 = false;
        else if (workInProgressRootDidSkipSuspendedSiblings = root2 = true, 2 === suspendedReason || 9 === suspendedReason || 3 === suspendedReason || 6 === suspendedReason)
          suspendedReason = suspenseHandlerStackCursor.current, null !== suspendedReason && 13 === suspendedReason.tag && (suspendedReason.flags |= 16384);
        unwindUnitOfWork(unitOfWork, root2);
      } else completeUnitOfWork(unitOfWork);
    }
    function completeUnitOfWork(unitOfWork) {
      var completedWork = unitOfWork;
      do {
        if (0 !== (completedWork.flags & 32768)) {
          unwindUnitOfWork(
            completedWork,
            workInProgressRootDidSkipSuspendedSiblings
          );
          return;
        }
        unitOfWork = completedWork.return;
        var next = completeWork(
          completedWork.alternate,
          completedWork,
          entangledRenderLanes
        );
        if (null !== next) {
          workInProgress = next;
          return;
        }
        completedWork = completedWork.sibling;
        if (null !== completedWork) {
          workInProgress = completedWork;
          return;
        }
        workInProgress = completedWork = unitOfWork;
      } while (null !== completedWork);
      0 === workInProgressRootExitStatus && (workInProgressRootExitStatus = 5);
    }
    function unwindUnitOfWork(unitOfWork, skipSiblings) {
      do {
        var next = unwindWork(unitOfWork.alternate, unitOfWork);
        if (null !== next) {
          next.flags &= 32767;
          workInProgress = next;
          return;
        }
        next = unitOfWork.return;
        null !== next && (next.flags |= 32768, next.subtreeFlags = 0, next.deletions = null);
        if (!skipSiblings && (unitOfWork = unitOfWork.sibling, null !== unitOfWork)) {
          workInProgress = unitOfWork;
          return;
        }
        workInProgress = unitOfWork = next;
      } while (null !== unitOfWork);
      workInProgressRootExitStatus = 6;
      workInProgress = null;
    }
    function commitRoot(root2, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes) {
      root2.cancelPendingCommit = null;
      do
        flushPendingEffects();
      while (0 !== pendingEffectsStatus);
      if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(327));
      if (null !== finishedWork) {
        if (finishedWork === root2.current) throw Error(formatProdErrorMessage(177));
        didIncludeRenderPhaseUpdate = finishedWork.lanes | finishedWork.childLanes;
        didIncludeRenderPhaseUpdate |= concurrentlyUpdatedLanes;
        markRootFinished(
          root2,
          lanes,
          didIncludeRenderPhaseUpdate,
          spawnedLane,
          updatedLanes,
          suspendedRetryLanes
        );
        root2 === workInProgressRoot && (workInProgress = workInProgressRoot = null, workInProgressRootRenderLanes = 0);
        pendingFinishedWork = finishedWork;
        pendingEffectsRoot = root2;
        pendingEffectsLanes = lanes;
        pendingEffectsRemainingLanes = didIncludeRenderPhaseUpdate;
        pendingPassiveTransitions = transitions;
        pendingRecoverableErrors = recoverableErrors;
        0 !== (finishedWork.subtreeFlags & 10256) || 0 !== (finishedWork.flags & 10256) ? (root2.callbackNode = null, root2.callbackPriority = 0, scheduleCallback$1(NormalPriority$1, function() {
          flushPassiveEffects();
          return null;
        })) : (root2.callbackNode = null, root2.callbackPriority = 0);
        recoverableErrors = 0 !== (finishedWork.flags & 13878);
        if (0 !== (finishedWork.subtreeFlags & 13878) || recoverableErrors) {
          recoverableErrors = ReactSharedInternals.T;
          ReactSharedInternals.T = null;
          transitions = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = 2;
          spawnedLane = executionContext;
          executionContext |= 4;
          try {
            commitBeforeMutationEffects(root2, finishedWork, lanes);
          } finally {
            executionContext = spawnedLane, ReactDOMSharedInternals.p = transitions, ReactSharedInternals.T = recoverableErrors;
          }
        }
        pendingEffectsStatus = 1;
        flushMutationEffects();
        flushLayoutEffects();
        flushSpawnedWork();
      }
    }
    function flushMutationEffects() {
      if (1 === pendingEffectsStatus) {
        pendingEffectsStatus = 0;
        var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, rootMutationHasEffect = 0 !== (finishedWork.flags & 13878);
        if (0 !== (finishedWork.subtreeFlags & 13878) || rootMutationHasEffect) {
          rootMutationHasEffect = ReactSharedInternals.T;
          ReactSharedInternals.T = null;
          var previousPriority = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = 2;
          var prevExecutionContext = executionContext;
          executionContext |= 4;
          try {
            commitMutationEffectsOnFiber(finishedWork, root2);
            var priorSelectionInformation = selectionInformation, curFocusedElem = getActiveElementDeep(root2.containerInfo), priorFocusedElem = priorSelectionInformation.focusedElem, priorSelectionRange = priorSelectionInformation.selectionRange;
            if (curFocusedElem !== priorFocusedElem && priorFocusedElem && priorFocusedElem.ownerDocument && containsNode(
              priorFocusedElem.ownerDocument.documentElement,
              priorFocusedElem
            )) {
              if (null !== priorSelectionRange && hasSelectionCapabilities(priorFocusedElem)) {
                var start = priorSelectionRange.start, end = priorSelectionRange.end;
                void 0 === end && (end = start);
                if ("selectionStart" in priorFocusedElem)
                  priorFocusedElem.selectionStart = start, priorFocusedElem.selectionEnd = Math.min(
                    end,
                    priorFocusedElem.value.length
                  );
                else {
                  var doc = priorFocusedElem.ownerDocument || document, win = doc && doc.defaultView || window;
                  if (win.getSelection) {
                    var selection = win.getSelection(), length = priorFocusedElem.textContent.length, start$jscomp$0 = Math.min(priorSelectionRange.start, length), end$jscomp$0 = void 0 === priorSelectionRange.end ? start$jscomp$0 : Math.min(priorSelectionRange.end, length);
                    !selection.extend && start$jscomp$0 > end$jscomp$0 && (curFocusedElem = end$jscomp$0, end$jscomp$0 = start$jscomp$0, start$jscomp$0 = curFocusedElem);
                    var startMarker = getNodeForCharacterOffset(
                      priorFocusedElem,
                      start$jscomp$0
                    ), endMarker = getNodeForCharacterOffset(
                      priorFocusedElem,
                      end$jscomp$0
                    );
                    if (startMarker && endMarker && (1 !== selection.rangeCount || selection.anchorNode !== startMarker.node || selection.anchorOffset !== startMarker.offset || selection.focusNode !== endMarker.node || selection.focusOffset !== endMarker.offset)) {
                      var range = doc.createRange();
                      range.setStart(startMarker.node, startMarker.offset);
                      selection.removeAllRanges();
                      start$jscomp$0 > end$jscomp$0 ? (selection.addRange(range), selection.extend(endMarker.node, endMarker.offset)) : (range.setEnd(endMarker.node, endMarker.offset), selection.addRange(range));
                    }
                  }
                }
              }
              doc = [];
              for (selection = priorFocusedElem; selection = selection.parentNode; )
                1 === selection.nodeType && doc.push({
                  element: selection,
                  left: selection.scrollLeft,
                  top: selection.scrollTop
                });
              "function" === typeof priorFocusedElem.focus && priorFocusedElem.focus();
              for (priorFocusedElem = 0; priorFocusedElem < doc.length; priorFocusedElem++) {
                var info = doc[priorFocusedElem];
                info.element.scrollLeft = info.left;
                info.element.scrollTop = info.top;
              }
            }
            _enabled = !!eventsEnabled;
            selectionInformation = eventsEnabled = null;
          } finally {
            executionContext = prevExecutionContext, ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = rootMutationHasEffect;
          }
        }
        root2.current = finishedWork;
        pendingEffectsStatus = 2;
      }
    }
    function flushLayoutEffects() {
      if (2 === pendingEffectsStatus) {
        pendingEffectsStatus = 0;
        var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, rootHasLayoutEffect = 0 !== (finishedWork.flags & 8772);
        if (0 !== (finishedWork.subtreeFlags & 8772) || rootHasLayoutEffect) {
          rootHasLayoutEffect = ReactSharedInternals.T;
          ReactSharedInternals.T = null;
          var previousPriority = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = 2;
          var prevExecutionContext = executionContext;
          executionContext |= 4;
          try {
            commitLayoutEffectOnFiber(root2, finishedWork.alternate, finishedWork);
          } finally {
            executionContext = prevExecutionContext, ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = rootHasLayoutEffect;
          }
        }
        pendingEffectsStatus = 3;
      }
    }
    function flushSpawnedWork() {
      if (4 === pendingEffectsStatus || 3 === pendingEffectsStatus) {
        pendingEffectsStatus = 0;
        requestPaint();
        var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, lanes = pendingEffectsLanes, recoverableErrors = pendingRecoverableErrors;
        0 !== (finishedWork.subtreeFlags & 10256) || 0 !== (finishedWork.flags & 10256) ? pendingEffectsStatus = 5 : (pendingEffectsStatus = 0, pendingFinishedWork = pendingEffectsRoot = null, releaseRootPooledCache(root2, root2.pendingLanes));
        var remainingLanes = root2.pendingLanes;
        0 === remainingLanes && (legacyErrorBoundariesThatAlreadyFailed = null);
        lanesToEventPriority(lanes);
        finishedWork = finishedWork.stateNode;
        if (injectedHook && "function" === typeof injectedHook.onCommitFiberRoot)
          try {
            injectedHook.onCommitFiberRoot(
              rendererID,
              finishedWork,
              void 0,
              128 === (finishedWork.current.flags & 128)
            );
          } catch (err) {
          }
        if (null !== recoverableErrors) {
          finishedWork = ReactSharedInternals.T;
          remainingLanes = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = 2;
          ReactSharedInternals.T = null;
          try {
            for (var onRecoverableError = root2.onRecoverableError, i = 0; i < recoverableErrors.length; i++) {
              var recoverableError = recoverableErrors[i];
              onRecoverableError(recoverableError.value, {
                componentStack: recoverableError.stack
              });
            }
          } finally {
            ReactSharedInternals.T = finishedWork, ReactDOMSharedInternals.p = remainingLanes;
          }
        }
        0 !== (pendingEffectsLanes & 3) && flushPendingEffects();
        ensureRootIsScheduled(root2);
        remainingLanes = root2.pendingLanes;
        0 !== (lanes & 261930) && 0 !== (remainingLanes & 42) ? root2 === rootWithNestedUpdates ? nestedUpdateCount++ : (nestedUpdateCount = 0, rootWithNestedUpdates = root2) : nestedUpdateCount = 0;
        flushSyncWorkAcrossRoots_impl(0, false);
      }
    }
    function releaseRootPooledCache(root2, remainingLanes) {
      0 === (root2.pooledCacheLanes &= remainingLanes) && (remainingLanes = root2.pooledCache, null != remainingLanes && (root2.pooledCache = null, releaseCache(remainingLanes)));
    }
    function flushPendingEffects() {
      flushMutationEffects();
      flushLayoutEffects();
      flushSpawnedWork();
      return flushPassiveEffects();
    }
    function flushPassiveEffects() {
      if (5 !== pendingEffectsStatus) return false;
      var root2 = pendingEffectsRoot, remainingLanes = pendingEffectsRemainingLanes;
      pendingEffectsRemainingLanes = 0;
      var renderPriority = lanesToEventPriority(pendingEffectsLanes), prevTransition = ReactSharedInternals.T, previousPriority = ReactDOMSharedInternals.p;
      try {
        ReactDOMSharedInternals.p = 32 > renderPriority ? 32 : renderPriority;
        ReactSharedInternals.T = null;
        renderPriority = pendingPassiveTransitions;
        pendingPassiveTransitions = null;
        var root$jscomp$0 = pendingEffectsRoot, lanes = pendingEffectsLanes;
        pendingEffectsStatus = 0;
        pendingFinishedWork = pendingEffectsRoot = null;
        pendingEffectsLanes = 0;
        if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(331));
        var prevExecutionContext = executionContext;
        executionContext |= 4;
        commitPassiveUnmountOnFiber(root$jscomp$0.current);
        commitPassiveMountOnFiber(
          root$jscomp$0,
          root$jscomp$0.current,
          lanes,
          renderPriority
        );
        executionContext = prevExecutionContext;
        flushSyncWorkAcrossRoots_impl(0, false);
        if (injectedHook && "function" === typeof injectedHook.onPostCommitFiberRoot)
          try {
            injectedHook.onPostCommitFiberRoot(rendererID, root$jscomp$0);
          } catch (err) {
          }
        return true;
      } finally {
        ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition, releaseRootPooledCache(root2, remainingLanes);
      }
    }
    function captureCommitPhaseErrorOnRoot(rootFiber, sourceFiber, error) {
      sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
      sourceFiber = createRootErrorUpdate(rootFiber.stateNode, sourceFiber, 2);
      rootFiber = enqueueUpdate(rootFiber, sourceFiber, 2);
      null !== rootFiber && (markRootUpdated$1(rootFiber, 2), ensureRootIsScheduled(rootFiber));
    }
    function captureCommitPhaseError(sourceFiber, nearestMountedAncestor, error) {
      if (3 === sourceFiber.tag)
        captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
      else
        for (; null !== nearestMountedAncestor; ) {
          if (3 === nearestMountedAncestor.tag) {
            captureCommitPhaseErrorOnRoot(
              nearestMountedAncestor,
              sourceFiber,
              error
            );
            break;
          } else if (1 === nearestMountedAncestor.tag) {
            var instance = nearestMountedAncestor.stateNode;
            if ("function" === typeof nearestMountedAncestor.type.getDerivedStateFromError || "function" === typeof instance.componentDidCatch && (null === legacyErrorBoundariesThatAlreadyFailed || !legacyErrorBoundariesThatAlreadyFailed.has(instance))) {
              sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
              error = createClassErrorUpdate(2);
              instance = enqueueUpdate(nearestMountedAncestor, error, 2);
              null !== instance && (initializeClassErrorUpdate(
                error,
                instance,
                nearestMountedAncestor,
                sourceFiber
              ), markRootUpdated$1(instance, 2), ensureRootIsScheduled(instance));
              break;
            }
          }
          nearestMountedAncestor = nearestMountedAncestor.return;
        }
    }
    function attachPingListener(root2, wakeable, lanes) {
      var pingCache = root2.pingCache;
      if (null === pingCache) {
        pingCache = root2.pingCache = new PossiblyWeakMap();
        var threadIDs = /* @__PURE__ */ new Set();
        pingCache.set(wakeable, threadIDs);
      } else
        threadIDs = pingCache.get(wakeable), void 0 === threadIDs && (threadIDs = /* @__PURE__ */ new Set(), pingCache.set(wakeable, threadIDs));
      threadIDs.has(lanes) || (workInProgressRootDidAttachPingListener = true, threadIDs.add(lanes), root2 = pingSuspendedRoot.bind(null, root2, wakeable, lanes), wakeable.then(root2, root2));
    }
    function pingSuspendedRoot(root2, wakeable, pingedLanes) {
      var pingCache = root2.pingCache;
      null !== pingCache && pingCache.delete(wakeable);
      root2.pingedLanes |= root2.suspendedLanes & pingedLanes;
      root2.warmLanes &= ~pingedLanes;
      workInProgressRoot === root2 && (workInProgressRootRenderLanes & pingedLanes) === pingedLanes && (4 === workInProgressRootExitStatus || 3 === workInProgressRootExitStatus && (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes && 300 > now() - globalMostRecentFallbackTime ? 0 === (executionContext & 2) && prepareFreshStack(root2, 0) : workInProgressRootPingedLanes |= pingedLanes, workInProgressSuspendedRetryLanes === workInProgressRootRenderLanes && (workInProgressSuspendedRetryLanes = 0));
      ensureRootIsScheduled(root2);
    }
    function retryTimedOutBoundary(boundaryFiber, retryLane) {
      0 === retryLane && (retryLane = claimNextRetryLane());
      boundaryFiber = enqueueConcurrentRenderForLane(boundaryFiber, retryLane);
      null !== boundaryFiber && (markRootUpdated$1(boundaryFiber, retryLane), ensureRootIsScheduled(boundaryFiber));
    }
    function retryDehydratedSuspenseBoundary(boundaryFiber) {
      var suspenseState = boundaryFiber.memoizedState, retryLane = 0;
      null !== suspenseState && (retryLane = suspenseState.retryLane);
      retryTimedOutBoundary(boundaryFiber, retryLane);
    }
    function resolveRetryWakeable(boundaryFiber, wakeable) {
      var retryLane = 0;
      switch (boundaryFiber.tag) {
        case 31:
        case 13:
          var retryCache = boundaryFiber.stateNode;
          var suspenseState = boundaryFiber.memoizedState;
          null !== suspenseState && (retryLane = suspenseState.retryLane);
          break;
        case 19:
          retryCache = boundaryFiber.stateNode;
          break;
        case 22:
          retryCache = boundaryFiber.stateNode._retryCache;
          break;
        default:
          throw Error(formatProdErrorMessage(314));
      }
      null !== retryCache && retryCache.delete(wakeable);
      retryTimedOutBoundary(boundaryFiber, retryLane);
    }
    function scheduleCallback$1(priorityLevel, callback) {
      return scheduleCallback$3(priorityLevel, callback);
    }
    var firstScheduledRoot = null;
    var lastScheduledRoot = null;
    var didScheduleMicrotask = false;
    var mightHavePendingSyncWork = false;
    var isFlushingWork = false;
    var currentEventTransitionLane = 0;
    function ensureRootIsScheduled(root2) {
      root2 !== lastScheduledRoot && null === root2.next && (null === lastScheduledRoot ? firstScheduledRoot = lastScheduledRoot = root2 : lastScheduledRoot = lastScheduledRoot.next = root2);
      mightHavePendingSyncWork = true;
      didScheduleMicrotask || (didScheduleMicrotask = true, scheduleImmediateRootScheduleTask());
    }
    function flushSyncWorkAcrossRoots_impl(syncTransitionLanes, onlyLegacy) {
      if (!isFlushingWork && mightHavePendingSyncWork) {
        isFlushingWork = true;
        do {
          var didPerformSomeWork = false;
          for (var root$170 = firstScheduledRoot; null !== root$170; ) {
            if (!onlyLegacy)
              if (0 !== syncTransitionLanes) {
                var pendingLanes = root$170.pendingLanes;
                if (0 === pendingLanes) var JSCompiler_inline_result = 0;
                else {
                  var suspendedLanes = root$170.suspendedLanes, pingedLanes = root$170.pingedLanes;
                  JSCompiler_inline_result = (1 << 31 - clz32(42 | syncTransitionLanes) + 1) - 1;
                  JSCompiler_inline_result &= pendingLanes & ~(suspendedLanes & ~pingedLanes);
                  JSCompiler_inline_result = JSCompiler_inline_result & 201326741 ? JSCompiler_inline_result & 201326741 | 1 : JSCompiler_inline_result ? JSCompiler_inline_result | 2 : 0;
                }
                0 !== JSCompiler_inline_result && (didPerformSomeWork = true, performSyncWorkOnRoot(root$170, JSCompiler_inline_result));
              } else
                JSCompiler_inline_result = workInProgressRootRenderLanes, JSCompiler_inline_result = getNextLanes(
                  root$170,
                  root$170 === workInProgressRoot ? JSCompiler_inline_result : 0,
                  null !== root$170.cancelPendingCommit || -1 !== root$170.timeoutHandle
                ), 0 === (JSCompiler_inline_result & 3) || checkIfRootIsPrerendering(root$170, JSCompiler_inline_result) || (didPerformSomeWork = true, performSyncWorkOnRoot(root$170, JSCompiler_inline_result));
            root$170 = root$170.next;
          }
        } while (didPerformSomeWork);
        isFlushingWork = false;
      }
    }
    function processRootScheduleInImmediateTask() {
      processRootScheduleInMicrotask();
    }
    function processRootScheduleInMicrotask() {
      mightHavePendingSyncWork = didScheduleMicrotask = false;
      var syncTransitionLanes = 0;
      0 !== currentEventTransitionLane && shouldAttemptEagerTransition() && (syncTransitionLanes = currentEventTransitionLane);
      for (var currentTime = now(), prev = null, root2 = firstScheduledRoot; null !== root2; ) {
        var next = root2.next, nextLanes = scheduleTaskForRootDuringMicrotask(root2, currentTime);
        if (0 === nextLanes)
          root2.next = null, null === prev ? firstScheduledRoot = next : prev.next = next, null === next && (lastScheduledRoot = prev);
        else if (prev = root2, 0 !== syncTransitionLanes || 0 !== (nextLanes & 3))
          mightHavePendingSyncWork = true;
        root2 = next;
      }
      0 !== pendingEffectsStatus && 5 !== pendingEffectsStatus || flushSyncWorkAcrossRoots_impl(syncTransitionLanes, false);
      0 !== currentEventTransitionLane && (currentEventTransitionLane = 0);
    }
    function scheduleTaskForRootDuringMicrotask(root2, currentTime) {
      for (var suspendedLanes = root2.suspendedLanes, pingedLanes = root2.pingedLanes, expirationTimes = root2.expirationTimes, lanes = root2.pendingLanes & -62914561; 0 < lanes; ) {
        var index$5 = 31 - clz32(lanes), lane = 1 << index$5, expirationTime = expirationTimes[index$5];
        if (-1 === expirationTime) {
          if (0 === (lane & suspendedLanes) || 0 !== (lane & pingedLanes))
            expirationTimes[index$5] = computeExpirationTime(lane, currentTime);
        } else expirationTime <= currentTime && (root2.expiredLanes |= lane);
        lanes &= ~lane;
      }
      currentTime = workInProgressRoot;
      suspendedLanes = workInProgressRootRenderLanes;
      suspendedLanes = getNextLanes(
        root2,
        root2 === currentTime ? suspendedLanes : 0,
        null !== root2.cancelPendingCommit || -1 !== root2.timeoutHandle
      );
      pingedLanes = root2.callbackNode;
      if (0 === suspendedLanes || root2 === currentTime && (2 === workInProgressSuspendedReason || 9 === workInProgressSuspendedReason) || null !== root2.cancelPendingCommit)
        return null !== pingedLanes && null !== pingedLanes && cancelCallback$1(pingedLanes), root2.callbackNode = null, root2.callbackPriority = 0;
      if (0 === (suspendedLanes & 3) || checkIfRootIsPrerendering(root2, suspendedLanes)) {
        currentTime = suspendedLanes & -suspendedLanes;
        if (currentTime === root2.callbackPriority) return currentTime;
        null !== pingedLanes && cancelCallback$1(pingedLanes);
        switch (lanesToEventPriority(suspendedLanes)) {
          case 2:
          case 8:
            suspendedLanes = UserBlockingPriority;
            break;
          case 32:
            suspendedLanes = NormalPriority$1;
            break;
          case 268435456:
            suspendedLanes = IdlePriority;
            break;
          default:
            suspendedLanes = NormalPriority$1;
        }
        pingedLanes = performWorkOnRootViaSchedulerTask.bind(null, root2);
        suspendedLanes = scheduleCallback$3(suspendedLanes, pingedLanes);
        root2.callbackPriority = currentTime;
        root2.callbackNode = suspendedLanes;
        return currentTime;
      }
      null !== pingedLanes && null !== pingedLanes && cancelCallback$1(pingedLanes);
      root2.callbackPriority = 2;
      root2.callbackNode = null;
      return 2;
    }
    function performWorkOnRootViaSchedulerTask(root2, didTimeout) {
      if (0 !== pendingEffectsStatus && 5 !== pendingEffectsStatus)
        return root2.callbackNode = null, root2.callbackPriority = 0, null;
      var originalCallbackNode = root2.callbackNode;
      if (flushPendingEffects() && root2.callbackNode !== originalCallbackNode)
        return null;
      var workInProgressRootRenderLanes$jscomp$0 = workInProgressRootRenderLanes;
      workInProgressRootRenderLanes$jscomp$0 = getNextLanes(
        root2,
        root2 === workInProgressRoot ? workInProgressRootRenderLanes$jscomp$0 : 0,
        null !== root2.cancelPendingCommit || -1 !== root2.timeoutHandle
      );
      if (0 === workInProgressRootRenderLanes$jscomp$0) return null;
      performWorkOnRoot(root2, workInProgressRootRenderLanes$jscomp$0, didTimeout);
      scheduleTaskForRootDuringMicrotask(root2, now());
      return null != root2.callbackNode && root2.callbackNode === originalCallbackNode ? performWorkOnRootViaSchedulerTask.bind(null, root2) : null;
    }
    function performSyncWorkOnRoot(root2, lanes) {
      if (flushPendingEffects()) return null;
      performWorkOnRoot(root2, lanes, true);
    }
    function scheduleImmediateRootScheduleTask() {
      scheduleMicrotask(function() {
        0 !== (executionContext & 6) ? scheduleCallback$3(
          ImmediatePriority,
          processRootScheduleInImmediateTask
        ) : processRootScheduleInMicrotask();
      });
    }
    function requestTransitionLane() {
      if (0 === currentEventTransitionLane) {
        var actionScopeLane = currentEntangledLane;
        0 === actionScopeLane && (actionScopeLane = nextTransitionUpdateLane, nextTransitionUpdateLane <<= 1, 0 === (nextTransitionUpdateLane & 261888) && (nextTransitionUpdateLane = 256));
        currentEventTransitionLane = actionScopeLane;
      }
      return currentEventTransitionLane;
    }
    function coerceFormActionProp(actionProp) {
      return null == actionProp || "symbol" === typeof actionProp || "boolean" === typeof actionProp ? null : "function" === typeof actionProp ? actionProp : sanitizeURL("" + actionProp);
    }
    function createFormDataWithSubmitter(form, submitter) {
      var temp = submitter.ownerDocument.createElement("input");
      temp.name = submitter.name;
      temp.value = submitter.value;
      form.id && temp.setAttribute("form", form.id);
      submitter.parentNode.insertBefore(temp, submitter);
      form = new FormData(form);
      temp.parentNode.removeChild(temp);
      return form;
    }
    function extractEvents$1(dispatchQueue, domEventName, maybeTargetInst, nativeEvent, nativeEventTarget) {
      if ("submit" === domEventName && maybeTargetInst && maybeTargetInst.stateNode === nativeEventTarget) {
        var action = coerceFormActionProp(
          (nativeEventTarget[internalPropsKey] || null).action
        ), submitter = nativeEvent.submitter;
        submitter && (domEventName = (domEventName = submitter[internalPropsKey] || null) ? coerceFormActionProp(domEventName.formAction) : submitter.getAttribute("formAction"), null !== domEventName && (action = domEventName, submitter = null));
        var event = new SyntheticEvent(
          "action",
          "action",
          null,
          nativeEvent,
          nativeEventTarget
        );
        dispatchQueue.push({
          event,
          listeners: [
            {
              instance: null,
              listener: function() {
                if (nativeEvent.defaultPrevented) {
                  if (0 !== currentEventTransitionLane) {
                    var formData = submitter ? createFormDataWithSubmitter(nativeEventTarget, submitter) : new FormData(nativeEventTarget);
                    startHostTransition(
                      maybeTargetInst,
                      {
                        pending: true,
                        data: formData,
                        method: nativeEventTarget.method,
                        action
                      },
                      null,
                      formData
                    );
                  }
                } else
                  "function" === typeof action && (event.preventDefault(), formData = submitter ? createFormDataWithSubmitter(nativeEventTarget, submitter) : new FormData(nativeEventTarget), startHostTransition(
                    maybeTargetInst,
                    {
                      pending: true,
                      data: formData,
                      method: nativeEventTarget.method,
                      action
                    },
                    action,
                    formData
                  ));
              },
              currentTarget: nativeEventTarget
            }
          ]
        });
      }
    }
    for (i$jscomp$inline_1577 = 0; i$jscomp$inline_1577 < simpleEventPluginEvents.length; i$jscomp$inline_1577++) {
      eventName$jscomp$inline_1578 = simpleEventPluginEvents[i$jscomp$inline_1577], domEventName$jscomp$inline_1579 = eventName$jscomp$inline_1578.toLowerCase(), capitalizedEvent$jscomp$inline_1580 = eventName$jscomp$inline_1578[0].toUpperCase() + eventName$jscomp$inline_1578.slice(1);
      registerSimpleEvent(
        domEventName$jscomp$inline_1579,
        "on" + capitalizedEvent$jscomp$inline_1580
      );
    }
    var eventName$jscomp$inline_1578;
    var domEventName$jscomp$inline_1579;
    var capitalizedEvent$jscomp$inline_1580;
    var i$jscomp$inline_1577;
    registerSimpleEvent(ANIMATION_END, "onAnimationEnd");
    registerSimpleEvent(ANIMATION_ITERATION, "onAnimationIteration");
    registerSimpleEvent(ANIMATION_START, "onAnimationStart");
    registerSimpleEvent("dblclick", "onDoubleClick");
    registerSimpleEvent("focusin", "onFocus");
    registerSimpleEvent("focusout", "onBlur");
    registerSimpleEvent(TRANSITION_RUN, "onTransitionRun");
    registerSimpleEvent(TRANSITION_START, "onTransitionStart");
    registerSimpleEvent(TRANSITION_CANCEL, "onTransitionCancel");
    registerSimpleEvent(TRANSITION_END, "onTransitionEnd");
    registerDirectEvent("onMouseEnter", ["mouseout", "mouseover"]);
    registerDirectEvent("onMouseLeave", ["mouseout", "mouseover"]);
    registerDirectEvent("onPointerEnter", ["pointerout", "pointerover"]);
    registerDirectEvent("onPointerLeave", ["pointerout", "pointerover"]);
    registerTwoPhaseEvent(
      "onChange",
      "change click focusin focusout input keydown keyup selectionchange".split(" ")
    );
    registerTwoPhaseEvent(
      "onSelect",
      "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
        " "
      )
    );
    registerTwoPhaseEvent("onBeforeInput", [
      "compositionend",
      "keypress",
      "textInput",
      "paste"
    ]);
    registerTwoPhaseEvent(
      "onCompositionEnd",
      "compositionend focusout keydown keypress keyup mousedown".split(" ")
    );
    registerTwoPhaseEvent(
      "onCompositionStart",
      "compositionstart focusout keydown keypress keyup mousedown".split(" ")
    );
    registerTwoPhaseEvent(
      "onCompositionUpdate",
      "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
    );
    var mediaEventTypes = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
      " "
    );
    var nonDelegatedEvents = new Set(
      "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(mediaEventTypes)
    );
    function processDispatchQueue(dispatchQueue, eventSystemFlags) {
      eventSystemFlags = 0 !== (eventSystemFlags & 4);
      for (var i = 0; i < dispatchQueue.length; i++) {
        var _dispatchQueue$i = dispatchQueue[i], event = _dispatchQueue$i.event;
        _dispatchQueue$i = _dispatchQueue$i.listeners;
        a: {
          var previousInstance = void 0;
          if (eventSystemFlags)
            for (var i$jscomp$0 = _dispatchQueue$i.length - 1; 0 <= i$jscomp$0; i$jscomp$0--) {
              var _dispatchListeners$i = _dispatchQueue$i[i$jscomp$0], instance = _dispatchListeners$i.instance, currentTarget = _dispatchListeners$i.currentTarget;
              _dispatchListeners$i = _dispatchListeners$i.listener;
              if (instance !== previousInstance && event.isPropagationStopped())
                break a;
              previousInstance = _dispatchListeners$i;
              event.currentTarget = currentTarget;
              try {
                previousInstance(event);
              } catch (error) {
                reportGlobalError(error);
              }
              event.currentTarget = null;
              previousInstance = instance;
            }
          else
            for (i$jscomp$0 = 0; i$jscomp$0 < _dispatchQueue$i.length; i$jscomp$0++) {
              _dispatchListeners$i = _dispatchQueue$i[i$jscomp$0];
              instance = _dispatchListeners$i.instance;
              currentTarget = _dispatchListeners$i.currentTarget;
              _dispatchListeners$i = _dispatchListeners$i.listener;
              if (instance !== previousInstance && event.isPropagationStopped())
                break a;
              previousInstance = _dispatchListeners$i;
              event.currentTarget = currentTarget;
              try {
                previousInstance(event);
              } catch (error) {
                reportGlobalError(error);
              }
              event.currentTarget = null;
              previousInstance = instance;
            }
        }
      }
    }
    function listenToNonDelegatedEvent(domEventName, targetElement) {
      var JSCompiler_inline_result = targetElement[internalEventHandlersKey];
      void 0 === JSCompiler_inline_result && (JSCompiler_inline_result = targetElement[internalEventHandlersKey] = /* @__PURE__ */ new Set());
      var listenerSetKey = domEventName + "__bubble";
      JSCompiler_inline_result.has(listenerSetKey) || (addTrappedEventListener(targetElement, domEventName, 2, false), JSCompiler_inline_result.add(listenerSetKey));
    }
    function listenToNativeEvent(domEventName, isCapturePhaseListener, target) {
      var eventSystemFlags = 0;
      isCapturePhaseListener && (eventSystemFlags |= 4);
      addTrappedEventListener(
        target,
        domEventName,
        eventSystemFlags,
        isCapturePhaseListener
      );
    }
    var listeningMarker = "_reactListening" + Math.random().toString(36).slice(2);
    function listenToAllSupportedEvents(rootContainerElement) {
      if (!rootContainerElement[listeningMarker]) {
        rootContainerElement[listeningMarker] = true;
        allNativeEvents.forEach(function(domEventName) {
          "selectionchange" !== domEventName && (nonDelegatedEvents.has(domEventName) || listenToNativeEvent(domEventName, false, rootContainerElement), listenToNativeEvent(domEventName, true, rootContainerElement));
        });
        var ownerDocument = 9 === rootContainerElement.nodeType ? rootContainerElement : rootContainerElement.ownerDocument;
        null === ownerDocument || ownerDocument[listeningMarker] || (ownerDocument[listeningMarker] = true, listenToNativeEvent("selectionchange", false, ownerDocument));
      }
    }
    function addTrappedEventListener(targetContainer, domEventName, eventSystemFlags, isCapturePhaseListener) {
      switch (getEventPriority(domEventName)) {
        case 2:
          var listenerWrapper = dispatchDiscreteEvent;
          break;
        case 8:
          listenerWrapper = dispatchContinuousEvent;
          break;
        default:
          listenerWrapper = dispatchEvent;
      }
      eventSystemFlags = listenerWrapper.bind(
        null,
        domEventName,
        eventSystemFlags,
        targetContainer
      );
      listenerWrapper = void 0;
      !passiveBrowserEventsSupported || "touchstart" !== domEventName && "touchmove" !== domEventName && "wheel" !== domEventName || (listenerWrapper = true);
      isCapturePhaseListener ? void 0 !== listenerWrapper ? targetContainer.addEventListener(domEventName, eventSystemFlags, {
        capture: true,
        passive: listenerWrapper
      }) : targetContainer.addEventListener(domEventName, eventSystemFlags, true) : void 0 !== listenerWrapper ? targetContainer.addEventListener(domEventName, eventSystemFlags, {
        passive: listenerWrapper
      }) : targetContainer.addEventListener(domEventName, eventSystemFlags, false);
    }
    function dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, targetInst$jscomp$0, targetContainer) {
      var ancestorInst = targetInst$jscomp$0;
      if (0 === (eventSystemFlags & 1) && 0 === (eventSystemFlags & 2) && null !== targetInst$jscomp$0)
        a: for (; ; ) {
          if (null === targetInst$jscomp$0) return;
          var nodeTag = targetInst$jscomp$0.tag;
          if (3 === nodeTag || 4 === nodeTag) {
            var container = targetInst$jscomp$0.stateNode.containerInfo;
            if (container === targetContainer) break;
            if (4 === nodeTag)
              for (nodeTag = targetInst$jscomp$0.return; null !== nodeTag; ) {
                var grandTag = nodeTag.tag;
                if ((3 === grandTag || 4 === grandTag) && nodeTag.stateNode.containerInfo === targetContainer)
                  return;
                nodeTag = nodeTag.return;
              }
            for (; null !== container; ) {
              nodeTag = getClosestInstanceFromNode(container);
              if (null === nodeTag) return;
              grandTag = nodeTag.tag;
              if (5 === grandTag || 6 === grandTag || 26 === grandTag || 27 === grandTag) {
                targetInst$jscomp$0 = ancestorInst = nodeTag;
                continue a;
              }
              container = container.parentNode;
            }
          }
          targetInst$jscomp$0 = targetInst$jscomp$0.return;
        }
      batchedUpdates$1(function() {
        var targetInst = ancestorInst, nativeEventTarget = getEventTarget(nativeEvent), dispatchQueue = [];
        a: {
          var reactName = topLevelEventsToReactNames.get(domEventName);
          if (void 0 !== reactName) {
            var SyntheticEventCtor = SyntheticEvent, reactEventType = domEventName;
            switch (domEventName) {
              case "keypress":
                if (0 === getEventCharCode(nativeEvent)) break a;
              case "keydown":
              case "keyup":
                SyntheticEventCtor = SyntheticKeyboardEvent;
                break;
              case "focusin":
                reactEventType = "focus";
                SyntheticEventCtor = SyntheticFocusEvent;
                break;
              case "focusout":
                reactEventType = "blur";
                SyntheticEventCtor = SyntheticFocusEvent;
                break;
              case "beforeblur":
              case "afterblur":
                SyntheticEventCtor = SyntheticFocusEvent;
                break;
              case "click":
                if (2 === nativeEvent.button) break a;
              case "auxclick":
              case "dblclick":
              case "mousedown":
              case "mousemove":
              case "mouseup":
              case "mouseout":
              case "mouseover":
              case "contextmenu":
                SyntheticEventCtor = SyntheticMouseEvent;
                break;
              case "drag":
              case "dragend":
              case "dragenter":
              case "dragexit":
              case "dragleave":
              case "dragover":
              case "dragstart":
              case "drop":
                SyntheticEventCtor = SyntheticDragEvent;
                break;
              case "touchcancel":
              case "touchend":
              case "touchmove":
              case "touchstart":
                SyntheticEventCtor = SyntheticTouchEvent;
                break;
              case ANIMATION_END:
              case ANIMATION_ITERATION:
              case ANIMATION_START:
                SyntheticEventCtor = SyntheticAnimationEvent;
                break;
              case TRANSITION_END:
                SyntheticEventCtor = SyntheticTransitionEvent;
                break;
              case "scroll":
              case "scrollend":
                SyntheticEventCtor = SyntheticUIEvent;
                break;
              case "wheel":
                SyntheticEventCtor = SyntheticWheelEvent;
                break;
              case "copy":
              case "cut":
              case "paste":
                SyntheticEventCtor = SyntheticClipboardEvent;
                break;
              case "gotpointercapture":
              case "lostpointercapture":
              case "pointercancel":
              case "pointerdown":
              case "pointermove":
              case "pointerout":
              case "pointerover":
              case "pointerup":
                SyntheticEventCtor = SyntheticPointerEvent;
                break;
              case "toggle":
              case "beforetoggle":
                SyntheticEventCtor = SyntheticToggleEvent;
            }
            var inCapturePhase = 0 !== (eventSystemFlags & 4), accumulateTargetOnly = !inCapturePhase && ("scroll" === domEventName || "scrollend" === domEventName), reactEventName = inCapturePhase ? null !== reactName ? reactName + "Capture" : null : reactName;
            inCapturePhase = [];
            for (var instance = targetInst, lastHostComponent; null !== instance; ) {
              var _instance = instance;
              lastHostComponent = _instance.stateNode;
              _instance = _instance.tag;
              5 !== _instance && 26 !== _instance && 27 !== _instance || null === lastHostComponent || null === reactEventName || (_instance = getListener(instance, reactEventName), null != _instance && inCapturePhase.push(
                createDispatchListener(instance, _instance, lastHostComponent)
              ));
              if (accumulateTargetOnly) break;
              instance = instance.return;
            }
            0 < inCapturePhase.length && (reactName = new SyntheticEventCtor(
              reactName,
              reactEventType,
              null,
              nativeEvent,
              nativeEventTarget
            ), dispatchQueue.push({ event: reactName, listeners: inCapturePhase }));
          }
        }
        if (0 === (eventSystemFlags & 7)) {
          a: {
            reactName = "mouseover" === domEventName || "pointerover" === domEventName;
            SyntheticEventCtor = "mouseout" === domEventName || "pointerout" === domEventName;
            if (reactName && nativeEvent !== currentReplayingEvent && (reactEventType = nativeEvent.relatedTarget || nativeEvent.fromElement) && (getClosestInstanceFromNode(reactEventType) || reactEventType[internalContainerInstanceKey]))
              break a;
            if (SyntheticEventCtor || reactName) {
              reactName = nativeEventTarget.window === nativeEventTarget ? nativeEventTarget : (reactName = nativeEventTarget.ownerDocument) ? reactName.defaultView || reactName.parentWindow : window;
              if (SyntheticEventCtor) {
                if (reactEventType = nativeEvent.relatedTarget || nativeEvent.toElement, SyntheticEventCtor = targetInst, reactEventType = reactEventType ? getClosestInstanceFromNode(reactEventType) : null, null !== reactEventType && (accumulateTargetOnly = getNearestMountedFiber(reactEventType), inCapturePhase = reactEventType.tag, reactEventType !== accumulateTargetOnly || 5 !== inCapturePhase && 27 !== inCapturePhase && 6 !== inCapturePhase))
                  reactEventType = null;
              } else SyntheticEventCtor = null, reactEventType = targetInst;
              if (SyntheticEventCtor !== reactEventType) {
                inCapturePhase = SyntheticMouseEvent;
                _instance = "onMouseLeave";
                reactEventName = "onMouseEnter";
                instance = "mouse";
                if ("pointerout" === domEventName || "pointerover" === domEventName)
                  inCapturePhase = SyntheticPointerEvent, _instance = "onPointerLeave", reactEventName = "onPointerEnter", instance = "pointer";
                accumulateTargetOnly = null == SyntheticEventCtor ? reactName : getNodeFromInstance(SyntheticEventCtor);
                lastHostComponent = null == reactEventType ? reactName : getNodeFromInstance(reactEventType);
                reactName = new inCapturePhase(
                  _instance,
                  instance + "leave",
                  SyntheticEventCtor,
                  nativeEvent,
                  nativeEventTarget
                );
                reactName.target = accumulateTargetOnly;
                reactName.relatedTarget = lastHostComponent;
                _instance = null;
                getClosestInstanceFromNode(nativeEventTarget) === targetInst && (inCapturePhase = new inCapturePhase(
                  reactEventName,
                  instance + "enter",
                  reactEventType,
                  nativeEvent,
                  nativeEventTarget
                ), inCapturePhase.target = lastHostComponent, inCapturePhase.relatedTarget = accumulateTargetOnly, _instance = inCapturePhase);
                accumulateTargetOnly = _instance;
                if (SyntheticEventCtor && reactEventType)
                  b: {
                    inCapturePhase = getParent;
                    reactEventName = SyntheticEventCtor;
                    instance = reactEventType;
                    lastHostComponent = 0;
                    for (_instance = reactEventName; _instance; _instance = inCapturePhase(_instance))
                      lastHostComponent++;
                    _instance = 0;
                    for (var tempB = instance; tempB; tempB = inCapturePhase(tempB))
                      _instance++;
                    for (; 0 < lastHostComponent - _instance; )
                      reactEventName = inCapturePhase(reactEventName), lastHostComponent--;
                    for (; 0 < _instance - lastHostComponent; )
                      instance = inCapturePhase(instance), _instance--;
                    for (; lastHostComponent--; ) {
                      if (reactEventName === instance || null !== instance && reactEventName === instance.alternate) {
                        inCapturePhase = reactEventName;
                        break b;
                      }
                      reactEventName = inCapturePhase(reactEventName);
                      instance = inCapturePhase(instance);
                    }
                    inCapturePhase = null;
                  }
                else inCapturePhase = null;
                null !== SyntheticEventCtor && accumulateEnterLeaveListenersForEvent(
                  dispatchQueue,
                  reactName,
                  SyntheticEventCtor,
                  inCapturePhase,
                  false
                );
                null !== reactEventType && null !== accumulateTargetOnly && accumulateEnterLeaveListenersForEvent(
                  dispatchQueue,
                  accumulateTargetOnly,
                  reactEventType,
                  inCapturePhase,
                  true
                );
              }
            }
          }
          a: {
            reactName = targetInst ? getNodeFromInstance(targetInst) : window;
            SyntheticEventCtor = reactName.nodeName && reactName.nodeName.toLowerCase();
            if ("select" === SyntheticEventCtor || "input" === SyntheticEventCtor && "file" === reactName.type)
              var getTargetInstFunc = getTargetInstForChangeEvent;
            else if (isTextInputElement(reactName))
              if (isInputEventSupported)
                getTargetInstFunc = getTargetInstForInputOrChangeEvent;
              else {
                getTargetInstFunc = getTargetInstForInputEventPolyfill;
                var handleEventFunc = handleEventsForInputEventPolyfill;
              }
            else
              SyntheticEventCtor = reactName.nodeName, !SyntheticEventCtor || "input" !== SyntheticEventCtor.toLowerCase() || "checkbox" !== reactName.type && "radio" !== reactName.type ? targetInst && isCustomElement(targetInst.elementType) && (getTargetInstFunc = getTargetInstForChangeEvent) : getTargetInstFunc = getTargetInstForClickEvent;
            if (getTargetInstFunc && (getTargetInstFunc = getTargetInstFunc(domEventName, targetInst))) {
              createAndAccumulateChangeEvent(
                dispatchQueue,
                getTargetInstFunc,
                nativeEvent,
                nativeEventTarget
              );
              break a;
            }
            handleEventFunc && handleEventFunc(domEventName, reactName, targetInst);
            "focusout" === domEventName && targetInst && "number" === reactName.type && null != targetInst.memoizedProps.value && setDefaultValue(reactName, "number", reactName.value);
          }
          handleEventFunc = targetInst ? getNodeFromInstance(targetInst) : window;
          switch (domEventName) {
            case "focusin":
              if (isTextInputElement(handleEventFunc) || "true" === handleEventFunc.contentEditable)
                activeElement = handleEventFunc, activeElementInst = targetInst, lastSelection = null;
              break;
            case "focusout":
              lastSelection = activeElementInst = activeElement = null;
              break;
            case "mousedown":
              mouseDown = true;
              break;
            case "contextmenu":
            case "mouseup":
            case "dragend":
              mouseDown = false;
              constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
              break;
            case "selectionchange":
              if (skipSelectionChangeEvent) break;
            case "keydown":
            case "keyup":
              constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
          }
          var fallbackData;
          if (canUseCompositionEvent)
            b: {
              switch (domEventName) {
                case "compositionstart":
                  var eventType = "onCompositionStart";
                  break b;
                case "compositionend":
                  eventType = "onCompositionEnd";
                  break b;
                case "compositionupdate":
                  eventType = "onCompositionUpdate";
                  break b;
              }
              eventType = void 0;
            }
          else
            isComposing ? isFallbackCompositionEnd(domEventName, nativeEvent) && (eventType = "onCompositionEnd") : "keydown" === domEventName && 229 === nativeEvent.keyCode && (eventType = "onCompositionStart");
          eventType && (useFallbackCompositionData && "ko" !== nativeEvent.locale && (isComposing || "onCompositionStart" !== eventType ? "onCompositionEnd" === eventType && isComposing && (fallbackData = getData()) : (root = nativeEventTarget, startText = "value" in root ? root.value : root.textContent, isComposing = true)), handleEventFunc = accumulateTwoPhaseListeners(targetInst, eventType), 0 < handleEventFunc.length && (eventType = new SyntheticCompositionEvent(
            eventType,
            domEventName,
            null,
            nativeEvent,
            nativeEventTarget
          ), dispatchQueue.push({ event: eventType, listeners: handleEventFunc }), fallbackData ? eventType.data = fallbackData : (fallbackData = getDataFromCustomEvent(nativeEvent), null !== fallbackData && (eventType.data = fallbackData))));
          if (fallbackData = canUseTextInputEvent ? getNativeBeforeInputChars(domEventName, nativeEvent) : getFallbackBeforeInputChars(domEventName, nativeEvent))
            eventType = accumulateTwoPhaseListeners(targetInst, "onBeforeInput"), 0 < eventType.length && (handleEventFunc = new SyntheticCompositionEvent(
              "onBeforeInput",
              "beforeinput",
              null,
              nativeEvent,
              nativeEventTarget
            ), dispatchQueue.push({
              event: handleEventFunc,
              listeners: eventType
            }), handleEventFunc.data = fallbackData);
          extractEvents$1(
            dispatchQueue,
            domEventName,
            targetInst,
            nativeEvent,
            nativeEventTarget
          );
        }
        processDispatchQueue(dispatchQueue, eventSystemFlags);
      });
    }
    function createDispatchListener(instance, listener, currentTarget) {
      return {
        instance,
        listener,
        currentTarget
      };
    }
    function accumulateTwoPhaseListeners(targetFiber, reactName) {
      for (var captureName = reactName + "Capture", listeners2 = []; null !== targetFiber; ) {
        var _instance2 = targetFiber, stateNode = _instance2.stateNode;
        _instance2 = _instance2.tag;
        5 !== _instance2 && 26 !== _instance2 && 27 !== _instance2 || null === stateNode || (_instance2 = getListener(targetFiber, captureName), null != _instance2 && listeners2.unshift(
          createDispatchListener(targetFiber, _instance2, stateNode)
        ), _instance2 = getListener(targetFiber, reactName), null != _instance2 && listeners2.push(
          createDispatchListener(targetFiber, _instance2, stateNode)
        ));
        if (3 === targetFiber.tag) return listeners2;
        targetFiber = targetFiber.return;
      }
      return [];
    }
    function getParent(inst) {
      if (null === inst) return null;
      do
        inst = inst.return;
      while (inst && 5 !== inst.tag && 27 !== inst.tag);
      return inst ? inst : null;
    }
    function accumulateEnterLeaveListenersForEvent(dispatchQueue, event, target, common, inCapturePhase) {
      for (var registrationName = event._reactName, listeners2 = []; null !== target && target !== common; ) {
        var _instance3 = target, alternate = _instance3.alternate, stateNode = _instance3.stateNode;
        _instance3 = _instance3.tag;
        if (null !== alternate && alternate === common) break;
        5 !== _instance3 && 26 !== _instance3 && 27 !== _instance3 || null === stateNode || (alternate = stateNode, inCapturePhase ? (stateNode = getListener(target, registrationName), null != stateNode && listeners2.unshift(
          createDispatchListener(target, stateNode, alternate)
        )) : inCapturePhase || (stateNode = getListener(target, registrationName), null != stateNode && listeners2.push(
          createDispatchListener(target, stateNode, alternate)
        )));
        target = target.return;
      }
      0 !== listeners2.length && dispatchQueue.push({ event, listeners: listeners2 });
    }
    var NORMALIZE_NEWLINES_REGEX = /\r\n?/g;
    var NORMALIZE_NULL_AND_REPLACEMENT_REGEX = /\u0000|\uFFFD/g;
    function normalizeMarkupForTextOrAttribute(markup) {
      return ("string" === typeof markup ? markup : "" + markup).replace(NORMALIZE_NEWLINES_REGEX, "\n").replace(NORMALIZE_NULL_AND_REPLACEMENT_REGEX, "");
    }
    function checkForUnmatchedText(serverText, clientText) {
      clientText = normalizeMarkupForTextOrAttribute(clientText);
      return normalizeMarkupForTextOrAttribute(serverText) === clientText ? true : false;
    }
    function setProp(domElement, tag, key, value, props, prevValue) {
      switch (key) {
        case "children":
          "string" === typeof value ? "body" === tag || "textarea" === tag && "" === value || setTextContent(domElement, value) : ("number" === typeof value || "bigint" === typeof value) && "body" !== tag && setTextContent(domElement, "" + value);
          break;
        case "className":
          setValueForKnownAttribute(domElement, "class", value);
          break;
        case "tabIndex":
          setValueForKnownAttribute(domElement, "tabindex", value);
          break;
        case "dir":
        case "role":
        case "viewBox":
        case "width":
        case "height":
          setValueForKnownAttribute(domElement, key, value);
          break;
        case "style":
          setValueForStyles(domElement, value, prevValue);
          break;
        case "data":
          if ("object" !== tag) {
            setValueForKnownAttribute(domElement, "data", value);
            break;
          }
        case "src":
        case "href":
          if ("" === value && ("a" !== tag || "href" !== key)) {
            domElement.removeAttribute(key);
            break;
          }
          if (null == value || "function" === typeof value || "symbol" === typeof value || "boolean" === typeof value) {
            domElement.removeAttribute(key);
            break;
          }
          value = sanitizeURL("" + value);
          domElement.setAttribute(key, value);
          break;
        case "action":
        case "formAction":
          if ("function" === typeof value) {
            domElement.setAttribute(
              key,
              "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')"
            );
            break;
          } else
            "function" === typeof prevValue && ("formAction" === key ? ("input" !== tag && setProp(domElement, tag, "name", props.name, props, null), setProp(
              domElement,
              tag,
              "formEncType",
              props.formEncType,
              props,
              null
            ), setProp(
              domElement,
              tag,
              "formMethod",
              props.formMethod,
              props,
              null
            ), setProp(
              domElement,
              tag,
              "formTarget",
              props.formTarget,
              props,
              null
            )) : (setProp(domElement, tag, "encType", props.encType, props, null), setProp(domElement, tag, "method", props.method, props, null), setProp(domElement, tag, "target", props.target, props, null)));
          if (null == value || "symbol" === typeof value || "boolean" === typeof value) {
            domElement.removeAttribute(key);
            break;
          }
          value = sanitizeURL("" + value);
          domElement.setAttribute(key, value);
          break;
        case "onClick":
          null != value && (domElement.onclick = noop$1);
          break;
        case "onScroll":
          null != value && listenToNonDelegatedEvent("scroll", domElement);
          break;
        case "onScrollEnd":
          null != value && listenToNonDelegatedEvent("scrollend", domElement);
          break;
        case "dangerouslySetInnerHTML":
          if (null != value) {
            if ("object" !== typeof value || !("__html" in value))
              throw Error(formatProdErrorMessage(61));
            key = value.__html;
            if (null != key) {
              if (null != props.children) throw Error(formatProdErrorMessage(60));
              domElement.innerHTML = key;
            }
          }
          break;
        case "multiple":
          domElement.multiple = value && "function" !== typeof value && "symbol" !== typeof value;
          break;
        case "muted":
          domElement.muted = value && "function" !== typeof value && "symbol" !== typeof value;
          break;
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "defaultValue":
        case "defaultChecked":
        case "innerHTML":
        case "ref":
          break;
        case "autoFocus":
          break;
        case "xlinkHref":
          if (null == value || "function" === typeof value || "boolean" === typeof value || "symbol" === typeof value) {
            domElement.removeAttribute("xlink:href");
            break;
          }
          key = sanitizeURL("" + value);
          domElement.setAttributeNS(
            "http://www.w3.org/1999/xlink",
            "xlink:href",
            key
          );
          break;
        case "contentEditable":
        case "spellCheck":
        case "draggable":
        case "value":
        case "autoReverse":
        case "externalResourcesRequired":
        case "focusable":
        case "preserveAlpha":
          null != value && "function" !== typeof value && "symbol" !== typeof value ? domElement.setAttribute(key, "" + value) : domElement.removeAttribute(key);
          break;
        case "inert":
        case "allowFullScreen":
        case "async":
        case "autoPlay":
        case "controls":
        case "default":
        case "defer":
        case "disabled":
        case "disablePictureInPicture":
        case "disableRemotePlayback":
        case "formNoValidate":
        case "hidden":
        case "loop":
        case "noModule":
        case "noValidate":
        case "open":
        case "playsInline":
        case "readOnly":
        case "required":
        case "reversed":
        case "scoped":
        case "seamless":
        case "itemScope":
          value && "function" !== typeof value && "symbol" !== typeof value ? domElement.setAttribute(key, "") : domElement.removeAttribute(key);
          break;
        case "capture":
        case "download":
          true === value ? domElement.setAttribute(key, "") : false !== value && null != value && "function" !== typeof value && "symbol" !== typeof value ? domElement.setAttribute(key, value) : domElement.removeAttribute(key);
          break;
        case "cols":
        case "rows":
        case "size":
        case "span":
          null != value && "function" !== typeof value && "symbol" !== typeof value && !isNaN(value) && 1 <= value ? domElement.setAttribute(key, value) : domElement.removeAttribute(key);
          break;
        case "rowSpan":
        case "start":
          null == value || "function" === typeof value || "symbol" === typeof value || isNaN(value) ? domElement.removeAttribute(key) : domElement.setAttribute(key, value);
          break;
        case "popover":
          listenToNonDelegatedEvent("beforetoggle", domElement);
          listenToNonDelegatedEvent("toggle", domElement);
          setValueForAttribute(domElement, "popover", value);
          break;
        case "xlinkActuate":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:actuate",
            value
          );
          break;
        case "xlinkArcrole":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:arcrole",
            value
          );
          break;
        case "xlinkRole":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:role",
            value
          );
          break;
        case "xlinkShow":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:show",
            value
          );
          break;
        case "xlinkTitle":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:title",
            value
          );
          break;
        case "xlinkType":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/1999/xlink",
            "xlink:type",
            value
          );
          break;
        case "xmlBase":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/XML/1998/namespace",
            "xml:base",
            value
          );
          break;
        case "xmlLang":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/XML/1998/namespace",
            "xml:lang",
            value
          );
          break;
        case "xmlSpace":
          setValueForNamespacedAttribute(
            domElement,
            "http://www.w3.org/XML/1998/namespace",
            "xml:space",
            value
          );
          break;
        case "is":
          setValueForAttribute(domElement, "is", value);
          break;
        case "innerText":
        case "textContent":
          break;
        default:
          if (!(2 < key.length) || "o" !== key[0] && "O" !== key[0] || "n" !== key[1] && "N" !== key[1])
            key = aliases.get(key) || key, setValueForAttribute(domElement, key, value);
      }
    }
    function setPropOnCustomElement(domElement, tag, key, value, props, prevValue) {
      switch (key) {
        case "style":
          setValueForStyles(domElement, value, prevValue);
          break;
        case "dangerouslySetInnerHTML":
          if (null != value) {
            if ("object" !== typeof value || !("__html" in value))
              throw Error(formatProdErrorMessage(61));
            key = value.__html;
            if (null != key) {
              if (null != props.children) throw Error(formatProdErrorMessage(60));
              domElement.innerHTML = key;
            }
          }
          break;
        case "children":
          "string" === typeof value ? setTextContent(domElement, value) : ("number" === typeof value || "bigint" === typeof value) && setTextContent(domElement, "" + value);
          break;
        case "onScroll":
          null != value && listenToNonDelegatedEvent("scroll", domElement);
          break;
        case "onScrollEnd":
          null != value && listenToNonDelegatedEvent("scrollend", domElement);
          break;
        case "onClick":
          null != value && (domElement.onclick = noop$1);
          break;
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "innerHTML":
        case "ref":
          break;
        case "innerText":
        case "textContent":
          break;
        default:
          if (!registrationNameDependencies.hasOwnProperty(key))
            a: {
              if ("o" === key[0] && "n" === key[1] && (props = key.endsWith("Capture"), tag = key.slice(2, props ? key.length - 7 : void 0), prevValue = domElement[internalPropsKey] || null, prevValue = null != prevValue ? prevValue[key] : null, "function" === typeof prevValue && domElement.removeEventListener(tag, prevValue, props), "function" === typeof value)) {
                "function" !== typeof prevValue && null !== prevValue && (key in domElement ? domElement[key] = null : domElement.hasAttribute(key) && domElement.removeAttribute(key));
                domElement.addEventListener(tag, value, props);
                break a;
              }
              key in domElement ? domElement[key] = value : true === value ? domElement.setAttribute(key, "") : setValueForAttribute(domElement, key, value);
            }
      }
    }
    function setInitialProperties(domElement, tag, props) {
      switch (tag) {
        case "div":
        case "span":
        case "svg":
        case "path":
        case "a":
        case "g":
        case "p":
        case "li":
          break;
        case "img":
          listenToNonDelegatedEvent("error", domElement);
          listenToNonDelegatedEvent("load", domElement);
          var hasSrc = false, hasSrcSet = false, propKey;
          for (propKey in props)
            if (props.hasOwnProperty(propKey)) {
              var propValue = props[propKey];
              if (null != propValue)
                switch (propKey) {
                  case "src":
                    hasSrc = true;
                    break;
                  case "srcSet":
                    hasSrcSet = true;
                    break;
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(formatProdErrorMessage(137, tag));
                  default:
                    setProp(domElement, tag, propKey, propValue, props, null);
                }
            }
          hasSrcSet && setProp(domElement, tag, "srcSet", props.srcSet, props, null);
          hasSrc && setProp(domElement, tag, "src", props.src, props, null);
          return;
        case "input":
          listenToNonDelegatedEvent("invalid", domElement);
          var defaultValue = propKey = propValue = hasSrcSet = null, checked = null, defaultChecked = null;
          for (hasSrc in props)
            if (props.hasOwnProperty(hasSrc)) {
              var propValue$184 = props[hasSrc];
              if (null != propValue$184)
                switch (hasSrc) {
                  case "name":
                    hasSrcSet = propValue$184;
                    break;
                  case "type":
                    propValue = propValue$184;
                    break;
                  case "checked":
                    checked = propValue$184;
                    break;
                  case "defaultChecked":
                    defaultChecked = propValue$184;
                    break;
                  case "value":
                    propKey = propValue$184;
                    break;
                  case "defaultValue":
                    defaultValue = propValue$184;
                    break;
                  case "children":
                  case "dangerouslySetInnerHTML":
                    if (null != propValue$184)
                      throw Error(formatProdErrorMessage(137, tag));
                    break;
                  default:
                    setProp(domElement, tag, hasSrc, propValue$184, props, null);
                }
            }
          initInput(
            domElement,
            propKey,
            defaultValue,
            checked,
            defaultChecked,
            propValue,
            hasSrcSet,
            false
          );
          return;
        case "select":
          listenToNonDelegatedEvent("invalid", domElement);
          hasSrc = propValue = propKey = null;
          for (hasSrcSet in props)
            if (props.hasOwnProperty(hasSrcSet) && (defaultValue = props[hasSrcSet], null != defaultValue))
              switch (hasSrcSet) {
                case "value":
                  propKey = defaultValue;
                  break;
                case "defaultValue":
                  propValue = defaultValue;
                  break;
                case "multiple":
                  hasSrc = defaultValue;
                default:
                  setProp(domElement, tag, hasSrcSet, defaultValue, props, null);
              }
          tag = propKey;
          props = propValue;
          domElement.multiple = !!hasSrc;
          null != tag ? updateOptions(domElement, !!hasSrc, tag, false) : null != props && updateOptions(domElement, !!hasSrc, props, true);
          return;
        case "textarea":
          listenToNonDelegatedEvent("invalid", domElement);
          propKey = hasSrcSet = hasSrc = null;
          for (propValue in props)
            if (props.hasOwnProperty(propValue) && (defaultValue = props[propValue], null != defaultValue))
              switch (propValue) {
                case "value":
                  hasSrc = defaultValue;
                  break;
                case "defaultValue":
                  hasSrcSet = defaultValue;
                  break;
                case "children":
                  propKey = defaultValue;
                  break;
                case "dangerouslySetInnerHTML":
                  if (null != defaultValue) throw Error(formatProdErrorMessage(91));
                  break;
                default:
                  setProp(domElement, tag, propValue, defaultValue, props, null);
              }
          initTextarea(domElement, hasSrc, hasSrcSet, propKey);
          return;
        case "option":
          for (checked in props)
            if (props.hasOwnProperty(checked) && (hasSrc = props[checked], null != hasSrc))
              switch (checked) {
                case "selected":
                  domElement.selected = hasSrc && "function" !== typeof hasSrc && "symbol" !== typeof hasSrc;
                  break;
                default:
                  setProp(domElement, tag, checked, hasSrc, props, null);
              }
          return;
        case "dialog":
          listenToNonDelegatedEvent("beforetoggle", domElement);
          listenToNonDelegatedEvent("toggle", domElement);
          listenToNonDelegatedEvent("cancel", domElement);
          listenToNonDelegatedEvent("close", domElement);
          break;
        case "iframe":
        case "object":
          listenToNonDelegatedEvent("load", domElement);
          break;
        case "video":
        case "audio":
          for (hasSrc = 0; hasSrc < mediaEventTypes.length; hasSrc++)
            listenToNonDelegatedEvent(mediaEventTypes[hasSrc], domElement);
          break;
        case "image":
          listenToNonDelegatedEvent("error", domElement);
          listenToNonDelegatedEvent("load", domElement);
          break;
        case "details":
          listenToNonDelegatedEvent("toggle", domElement);
          break;
        case "embed":
        case "source":
        case "link":
          listenToNonDelegatedEvent("error", domElement), listenToNonDelegatedEvent("load", domElement);
        case "area":
        case "base":
        case "br":
        case "col":
        case "hr":
        case "keygen":
        case "meta":
        case "param":
        case "track":
        case "wbr":
        case "menuitem":
          for (defaultChecked in props)
            if (props.hasOwnProperty(defaultChecked) && (hasSrc = props[defaultChecked], null != hasSrc))
              switch (defaultChecked) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(formatProdErrorMessage(137, tag));
                default:
                  setProp(domElement, tag, defaultChecked, hasSrc, props, null);
              }
          return;
        default:
          if (isCustomElement(tag)) {
            for (propValue$184 in props)
              props.hasOwnProperty(propValue$184) && (hasSrc = props[propValue$184], void 0 !== hasSrc && setPropOnCustomElement(
                domElement,
                tag,
                propValue$184,
                hasSrc,
                props,
                void 0
              ));
            return;
          }
      }
      for (defaultValue in props)
        props.hasOwnProperty(defaultValue) && (hasSrc = props[defaultValue], null != hasSrc && setProp(domElement, tag, defaultValue, hasSrc, props, null));
    }
    function updateProperties(domElement, tag, lastProps, nextProps) {
      switch (tag) {
        case "div":
        case "span":
        case "svg":
        case "path":
        case "a":
        case "g":
        case "p":
        case "li":
          break;
        case "input":
          var name = null, type = null, value = null, defaultValue = null, lastDefaultValue = null, checked = null, defaultChecked = null;
          for (propKey in lastProps) {
            var lastProp = lastProps[propKey];
            if (lastProps.hasOwnProperty(propKey) && null != lastProp)
              switch (propKey) {
                case "checked":
                  break;
                case "value":
                  break;
                case "defaultValue":
                  lastDefaultValue = lastProp;
                default:
                  nextProps.hasOwnProperty(propKey) || setProp(domElement, tag, propKey, null, nextProps, lastProp);
              }
          }
          for (var propKey$201 in nextProps) {
            var propKey = nextProps[propKey$201];
            lastProp = lastProps[propKey$201];
            if (nextProps.hasOwnProperty(propKey$201) && (null != propKey || null != lastProp))
              switch (propKey$201) {
                case "type":
                  type = propKey;
                  break;
                case "name":
                  name = propKey;
                  break;
                case "checked":
                  checked = propKey;
                  break;
                case "defaultChecked":
                  defaultChecked = propKey;
                  break;
                case "value":
                  value = propKey;
                  break;
                case "defaultValue":
                  defaultValue = propKey;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (null != propKey)
                    throw Error(formatProdErrorMessage(137, tag));
                  break;
                default:
                  propKey !== lastProp && setProp(
                    domElement,
                    tag,
                    propKey$201,
                    propKey,
                    nextProps,
                    lastProp
                  );
              }
          }
          updateInput(
            domElement,
            value,
            defaultValue,
            lastDefaultValue,
            checked,
            defaultChecked,
            type,
            name
          );
          return;
        case "select":
          propKey = value = defaultValue = propKey$201 = null;
          for (type in lastProps)
            if (lastDefaultValue = lastProps[type], lastProps.hasOwnProperty(type) && null != lastDefaultValue)
              switch (type) {
                case "value":
                  break;
                case "multiple":
                  propKey = lastDefaultValue;
                default:
                  nextProps.hasOwnProperty(type) || setProp(
                    domElement,
                    tag,
                    type,
                    null,
                    nextProps,
                    lastDefaultValue
                  );
              }
          for (name in nextProps)
            if (type = nextProps[name], lastDefaultValue = lastProps[name], nextProps.hasOwnProperty(name) && (null != type || null != lastDefaultValue))
              switch (name) {
                case "value":
                  propKey$201 = type;
                  break;
                case "defaultValue":
                  defaultValue = type;
                  break;
                case "multiple":
                  value = type;
                default:
                  type !== lastDefaultValue && setProp(
                    domElement,
                    tag,
                    name,
                    type,
                    nextProps,
                    lastDefaultValue
                  );
              }
          tag = defaultValue;
          lastProps = value;
          nextProps = propKey;
          null != propKey$201 ? updateOptions(domElement, !!lastProps, propKey$201, false) : !!nextProps !== !!lastProps && (null != tag ? updateOptions(domElement, !!lastProps, tag, true) : updateOptions(domElement, !!lastProps, lastProps ? [] : "", false));
          return;
        case "textarea":
          propKey = propKey$201 = null;
          for (defaultValue in lastProps)
            if (name = lastProps[defaultValue], lastProps.hasOwnProperty(defaultValue) && null != name && !nextProps.hasOwnProperty(defaultValue))
              switch (defaultValue) {
                case "value":
                  break;
                case "children":
                  break;
                default:
                  setProp(domElement, tag, defaultValue, null, nextProps, name);
              }
          for (value in nextProps)
            if (name = nextProps[value], type = lastProps[value], nextProps.hasOwnProperty(value) && (null != name || null != type))
              switch (value) {
                case "value":
                  propKey$201 = name;
                  break;
                case "defaultValue":
                  propKey = name;
                  break;
                case "children":
                  break;
                case "dangerouslySetInnerHTML":
                  if (null != name) throw Error(formatProdErrorMessage(91));
                  break;
                default:
                  name !== type && setProp(domElement, tag, value, name, nextProps, type);
              }
          updateTextarea(domElement, propKey$201, propKey);
          return;
        case "option":
          for (var propKey$217 in lastProps)
            if (propKey$201 = lastProps[propKey$217], lastProps.hasOwnProperty(propKey$217) && null != propKey$201 && !nextProps.hasOwnProperty(propKey$217))
              switch (propKey$217) {
                case "selected":
                  domElement.selected = false;
                  break;
                default:
                  setProp(
                    domElement,
                    tag,
                    propKey$217,
                    null,
                    nextProps,
                    propKey$201
                  );
              }
          for (lastDefaultValue in nextProps)
            if (propKey$201 = nextProps[lastDefaultValue], propKey = lastProps[lastDefaultValue], nextProps.hasOwnProperty(lastDefaultValue) && propKey$201 !== propKey && (null != propKey$201 || null != propKey))
              switch (lastDefaultValue) {
                case "selected":
                  domElement.selected = propKey$201 && "function" !== typeof propKey$201 && "symbol" !== typeof propKey$201;
                  break;
                default:
                  setProp(
                    domElement,
                    tag,
                    lastDefaultValue,
                    propKey$201,
                    nextProps,
                    propKey
                  );
              }
          return;
        case "img":
        case "link":
        case "area":
        case "base":
        case "br":
        case "col":
        case "embed":
        case "hr":
        case "keygen":
        case "meta":
        case "param":
        case "source":
        case "track":
        case "wbr":
        case "menuitem":
          for (var propKey$222 in lastProps)
            propKey$201 = lastProps[propKey$222], lastProps.hasOwnProperty(propKey$222) && null != propKey$201 && !nextProps.hasOwnProperty(propKey$222) && setProp(domElement, tag, propKey$222, null, nextProps, propKey$201);
          for (checked in nextProps)
            if (propKey$201 = nextProps[checked], propKey = lastProps[checked], nextProps.hasOwnProperty(checked) && propKey$201 !== propKey && (null != propKey$201 || null != propKey))
              switch (checked) {
                case "children":
                case "dangerouslySetInnerHTML":
                  if (null != propKey$201)
                    throw Error(formatProdErrorMessage(137, tag));
                  break;
                default:
                  setProp(
                    domElement,
                    tag,
                    checked,
                    propKey$201,
                    nextProps,
                    propKey
                  );
              }
          return;
        default:
          if (isCustomElement(tag)) {
            for (var propKey$227 in lastProps)
              propKey$201 = lastProps[propKey$227], lastProps.hasOwnProperty(propKey$227) && void 0 !== propKey$201 && !nextProps.hasOwnProperty(propKey$227) && setPropOnCustomElement(
                domElement,
                tag,
                propKey$227,
                void 0,
                nextProps,
                propKey$201
              );
            for (defaultChecked in nextProps)
              propKey$201 = nextProps[defaultChecked], propKey = lastProps[defaultChecked], !nextProps.hasOwnProperty(defaultChecked) || propKey$201 === propKey || void 0 === propKey$201 && void 0 === propKey || setPropOnCustomElement(
                domElement,
                tag,
                defaultChecked,
                propKey$201,
                nextProps,
                propKey
              );
            return;
          }
      }
      for (var propKey$232 in lastProps)
        propKey$201 = lastProps[propKey$232], lastProps.hasOwnProperty(propKey$232) && null != propKey$201 && !nextProps.hasOwnProperty(propKey$232) && setProp(domElement, tag, propKey$232, null, nextProps, propKey$201);
      for (lastProp in nextProps)
        propKey$201 = nextProps[lastProp], propKey = lastProps[lastProp], !nextProps.hasOwnProperty(lastProp) || propKey$201 === propKey || null == propKey$201 && null == propKey || setProp(domElement, tag, lastProp, propKey$201, nextProps, propKey);
    }
    function isLikelyStaticResource(initiatorType) {
      switch (initiatorType) {
        case "css":
        case "script":
        case "font":
        case "img":
        case "image":
        case "input":
        case "link":
          return true;
        default:
          return false;
      }
    }
    function estimateBandwidth() {
      if ("function" === typeof performance.getEntriesByType) {
        for (var count = 0, bits = 0, resourceEntries = performance.getEntriesByType("resource"), i = 0; i < resourceEntries.length; i++) {
          var entry = resourceEntries[i], transferSize = entry.transferSize, initiatorType = entry.initiatorType, duration = entry.duration;
          if (transferSize && duration && isLikelyStaticResource(initiatorType)) {
            initiatorType = 0;
            duration = entry.responseEnd;
            for (i += 1; i < resourceEntries.length; i++) {
              var overlapEntry = resourceEntries[i], overlapStartTime = overlapEntry.startTime;
              if (overlapStartTime > duration) break;
              var overlapTransferSize = overlapEntry.transferSize, overlapInitiatorType = overlapEntry.initiatorType;
              overlapTransferSize && isLikelyStaticResource(overlapInitiatorType) && (overlapEntry = overlapEntry.responseEnd, initiatorType += overlapTransferSize * (overlapEntry < duration ? 1 : (duration - overlapStartTime) / (overlapEntry - overlapStartTime)));
            }
            --i;
            bits += 8 * (transferSize + initiatorType) / (entry.duration / 1e3);
            count++;
            if (10 < count) break;
          }
        }
        if (0 < count) return bits / count / 1e6;
      }
      return navigator.connection && (count = navigator.connection.downlink, "number" === typeof count) ? count : 5;
    }
    var eventsEnabled = null;
    var selectionInformation = null;
    function getOwnerDocumentFromRootContainer(rootContainerElement) {
      return 9 === rootContainerElement.nodeType ? rootContainerElement : rootContainerElement.ownerDocument;
    }
    function getOwnHostContext(namespaceURI) {
      switch (namespaceURI) {
        case "http://www.w3.org/2000/svg":
          return 1;
        case "http://www.w3.org/1998/Math/MathML":
          return 2;
        default:
          return 0;
      }
    }
    function getChildHostContextProd(parentNamespace, type) {
      if (0 === parentNamespace)
        switch (type) {
          case "svg":
            return 1;
          case "math":
            return 2;
          default:
            return 0;
        }
      return 1 === parentNamespace && "foreignObject" === type ? 0 : parentNamespace;
    }
    function shouldSetTextContent(type, props) {
      return "textarea" === type || "noscript" === type || "string" === typeof props.children || "number" === typeof props.children || "bigint" === typeof props.children || "object" === typeof props.dangerouslySetInnerHTML && null !== props.dangerouslySetInnerHTML && null != props.dangerouslySetInnerHTML.__html;
    }
    var currentPopstateTransitionEvent = null;
    function shouldAttemptEagerTransition() {
      var event = window.event;
      if (event && "popstate" === event.type) {
        if (event === currentPopstateTransitionEvent) return false;
        currentPopstateTransitionEvent = event;
        return true;
      }
      currentPopstateTransitionEvent = null;
      return false;
    }
    var scheduleTimeout = "function" === typeof setTimeout ? setTimeout : void 0;
    var cancelTimeout = "function" === typeof clearTimeout ? clearTimeout : void 0;
    var localPromise = "function" === typeof Promise ? Promise : void 0;
    var scheduleMicrotask = "function" === typeof queueMicrotask ? queueMicrotask : "undefined" !== typeof localPromise ? function(callback) {
      return localPromise.resolve(null).then(callback).catch(handleErrorInNextTick);
    } : scheduleTimeout;
    function handleErrorInNextTick(error) {
      setTimeout(function() {
        throw error;
      });
    }
    function isSingletonScope(type) {
      return "head" === type;
    }
    function clearHydrationBoundary(parentInstance, hydrationInstance) {
      var node = hydrationInstance, depth = 0;
      do {
        var nextNode = node.nextSibling;
        parentInstance.removeChild(node);
        if (nextNode && 8 === nextNode.nodeType)
          if (node = nextNode.data, "/$" === node || "/&" === node) {
            if (0 === depth) {
              parentInstance.removeChild(nextNode);
              retryIfBlockedOn(hydrationInstance);
              return;
            }
            depth--;
          } else if ("$" === node || "$?" === node || "$~" === node || "$!" === node || "&" === node)
            depth++;
          else if ("html" === node)
            releaseSingletonInstance(parentInstance.ownerDocument.documentElement);
          else if ("head" === node) {
            node = parentInstance.ownerDocument.head;
            releaseSingletonInstance(node);
            for (var node$jscomp$0 = node.firstChild; node$jscomp$0; ) {
              var nextNode$jscomp$0 = node$jscomp$0.nextSibling, nodeName = node$jscomp$0.nodeName;
              node$jscomp$0[internalHoistableMarker] || "SCRIPT" === nodeName || "STYLE" === nodeName || "LINK" === nodeName && "stylesheet" === node$jscomp$0.rel.toLowerCase() || node.removeChild(node$jscomp$0);
              node$jscomp$0 = nextNode$jscomp$0;
            }
          } else
            "body" === node && releaseSingletonInstance(parentInstance.ownerDocument.body);
        node = nextNode;
      } while (node);
      retryIfBlockedOn(hydrationInstance);
    }
    function hideOrUnhideDehydratedBoundary(suspenseInstance, isHidden) {
      var node = suspenseInstance;
      suspenseInstance = 0;
      do {
        var nextNode = node.nextSibling;
        1 === node.nodeType ? isHidden ? (node._stashedDisplay = node.style.display, node.style.display = "none") : (node.style.display = node._stashedDisplay || "", "" === node.getAttribute("style") && node.removeAttribute("style")) : 3 === node.nodeType && (isHidden ? (node._stashedText = node.nodeValue, node.nodeValue = "") : node.nodeValue = node._stashedText || "");
        if (nextNode && 8 === nextNode.nodeType)
          if (node = nextNode.data, "/$" === node)
            if (0 === suspenseInstance) break;
            else suspenseInstance--;
          else
            "$" !== node && "$?" !== node && "$~" !== node && "$!" !== node || suspenseInstance++;
        node = nextNode;
      } while (node);
    }
    function clearContainerSparingly(container) {
      var nextNode = container.firstChild;
      nextNode && 10 === nextNode.nodeType && (nextNode = nextNode.nextSibling);
      for (; nextNode; ) {
        var node = nextNode;
        nextNode = nextNode.nextSibling;
        switch (node.nodeName) {
          case "HTML":
          case "HEAD":
          case "BODY":
            clearContainerSparingly(node);
            detachDeletedInstance(node);
            continue;
          case "SCRIPT":
          case "STYLE":
            continue;
          case "LINK":
            if ("stylesheet" === node.rel.toLowerCase()) continue;
        }
        container.removeChild(node);
      }
    }
    function canHydrateInstance(instance, type, props, inRootOrSingleton) {
      for (; 1 === instance.nodeType; ) {
        var anyProps = props;
        if (instance.nodeName.toLowerCase() !== type.toLowerCase()) {
          if (!inRootOrSingleton && ("INPUT" !== instance.nodeName || "hidden" !== instance.type))
            break;
        } else if (!inRootOrSingleton)
          if ("input" === type && "hidden" === instance.type) {
            var name = null == anyProps.name ? null : "" + anyProps.name;
            if ("hidden" === anyProps.type && instance.getAttribute("name") === name)
              return instance;
          } else return instance;
        else if (!instance[internalHoistableMarker])
          switch (type) {
            case "meta":
              if (!instance.hasAttribute("itemprop")) break;
              return instance;
            case "link":
              name = instance.getAttribute("rel");
              if ("stylesheet" === name && instance.hasAttribute("data-precedence"))
                break;
              else if (name !== anyProps.rel || instance.getAttribute("href") !== (null == anyProps.href || "" === anyProps.href ? null : anyProps.href) || instance.getAttribute("crossorigin") !== (null == anyProps.crossOrigin ? null : anyProps.crossOrigin) || instance.getAttribute("title") !== (null == anyProps.title ? null : anyProps.title))
                break;
              return instance;
            case "style":
              if (instance.hasAttribute("data-precedence")) break;
              return instance;
            case "script":
              name = instance.getAttribute("src");
              if ((name !== (null == anyProps.src ? null : anyProps.src) || instance.getAttribute("type") !== (null == anyProps.type ? null : anyProps.type) || instance.getAttribute("crossorigin") !== (null == anyProps.crossOrigin ? null : anyProps.crossOrigin)) && name && instance.hasAttribute("async") && !instance.hasAttribute("itemprop"))
                break;
              return instance;
            default:
              return instance;
          }
        instance = getNextHydratable(instance.nextSibling);
        if (null === instance) break;
      }
      return null;
    }
    function canHydrateTextInstance(instance, text, inRootOrSingleton) {
      if ("" === text) return null;
      for (; 3 !== instance.nodeType; ) {
        if ((1 !== instance.nodeType || "INPUT" !== instance.nodeName || "hidden" !== instance.type) && !inRootOrSingleton)
          return null;
        instance = getNextHydratable(instance.nextSibling);
        if (null === instance) return null;
      }
      return instance;
    }
    function canHydrateHydrationBoundary(instance, inRootOrSingleton) {
      for (; 8 !== instance.nodeType; ) {
        if ((1 !== instance.nodeType || "INPUT" !== instance.nodeName || "hidden" !== instance.type) && !inRootOrSingleton)
          return null;
        instance = getNextHydratable(instance.nextSibling);
        if (null === instance) return null;
      }
      return instance;
    }
    function isSuspenseInstancePending(instance) {
      return "$?" === instance.data || "$~" === instance.data;
    }
    function isSuspenseInstanceFallback(instance) {
      return "$!" === instance.data || "$?" === instance.data && "loading" !== instance.ownerDocument.readyState;
    }
    function registerSuspenseInstanceRetry(instance, callback) {
      var ownerDocument = instance.ownerDocument;
      if ("$~" === instance.data) instance._reactRetry = callback;
      else if ("$?" !== instance.data || "loading" !== ownerDocument.readyState)
        callback();
      else {
        var listener = function() {
          callback();
          ownerDocument.removeEventListener("DOMContentLoaded", listener);
        };
        ownerDocument.addEventListener("DOMContentLoaded", listener);
        instance._reactRetry = listener;
      }
    }
    function getNextHydratable(node) {
      for (; null != node; node = node.nextSibling) {
        var nodeType = node.nodeType;
        if (1 === nodeType || 3 === nodeType) break;
        if (8 === nodeType) {
          nodeType = node.data;
          if ("$" === nodeType || "$!" === nodeType || "$?" === nodeType || "$~" === nodeType || "&" === nodeType || "F!" === nodeType || "F" === nodeType)
            break;
          if ("/$" === nodeType || "/&" === nodeType) return null;
        }
      }
      return node;
    }
    var previousHydratableOnEnteringScopedSingleton = null;
    function getNextHydratableInstanceAfterHydrationBoundary(hydrationInstance) {
      hydrationInstance = hydrationInstance.nextSibling;
      for (var depth = 0; hydrationInstance; ) {
        if (8 === hydrationInstance.nodeType) {
          var data = hydrationInstance.data;
          if ("/$" === data || "/&" === data) {
            if (0 === depth)
              return getNextHydratable(hydrationInstance.nextSibling);
            depth--;
          } else
            "$" !== data && "$!" !== data && "$?" !== data && "$~" !== data && "&" !== data || depth++;
        }
        hydrationInstance = hydrationInstance.nextSibling;
      }
      return null;
    }
    function getParentHydrationBoundary(targetInstance) {
      targetInstance = targetInstance.previousSibling;
      for (var depth = 0; targetInstance; ) {
        if (8 === targetInstance.nodeType) {
          var data = targetInstance.data;
          if ("$" === data || "$!" === data || "$?" === data || "$~" === data || "&" === data) {
            if (0 === depth) return targetInstance;
            depth--;
          } else "/$" !== data && "/&" !== data || depth++;
        }
        targetInstance = targetInstance.previousSibling;
      }
      return null;
    }
    function resolveSingletonInstance(type, props, rootContainerInstance) {
      props = getOwnerDocumentFromRootContainer(rootContainerInstance);
      switch (type) {
        case "html":
          type = props.documentElement;
          if (!type) throw Error(formatProdErrorMessage(452));
          return type;
        case "head":
          type = props.head;
          if (!type) throw Error(formatProdErrorMessage(453));
          return type;
        case "body":
          type = props.body;
          if (!type) throw Error(formatProdErrorMessage(454));
          return type;
        default:
          throw Error(formatProdErrorMessage(451));
      }
    }
    function releaseSingletonInstance(instance) {
      for (var attributes = instance.attributes; attributes.length; )
        instance.removeAttributeNode(attributes[0]);
      detachDeletedInstance(instance);
    }
    var preloadPropsMap = /* @__PURE__ */ new Map();
    var preconnectsSet = /* @__PURE__ */ new Set();
    function getHoistableRoot(container) {
      return "function" === typeof container.getRootNode ? container.getRootNode() : 9 === container.nodeType ? container : container.ownerDocument;
    }
    var previousDispatcher = ReactDOMSharedInternals.d;
    ReactDOMSharedInternals.d = {
      f: flushSyncWork,
      r: requestFormReset,
      D: prefetchDNS,
      C: preconnect,
      L: preload,
      m: preloadModule,
      X: preinitScript,
      S: preinitStyle,
      M: preinitModuleScript
    };
    function flushSyncWork() {
      var previousWasRendering = previousDispatcher.f(), wasRendering = flushSyncWork$1();
      return previousWasRendering || wasRendering;
    }
    function requestFormReset(form) {
      var formInst = getInstanceFromNode(form);
      null !== formInst && 5 === formInst.tag && "form" === formInst.type ? requestFormReset$1(formInst) : previousDispatcher.r(form);
    }
    var globalDocument = "undefined" === typeof document ? null : document;
    function preconnectAs(rel, href, crossOrigin) {
      var ownerDocument = globalDocument;
      if (ownerDocument && "string" === typeof href && href) {
        var limitedEscapedHref = escapeSelectorAttributeValueInsideDoubleQuotes(href);
        limitedEscapedHref = 'link[rel="' + rel + '"][href="' + limitedEscapedHref + '"]';
        "string" === typeof crossOrigin && (limitedEscapedHref += '[crossorigin="' + crossOrigin + '"]');
        preconnectsSet.has(limitedEscapedHref) || (preconnectsSet.add(limitedEscapedHref), rel = { rel, crossOrigin, href }, null === ownerDocument.querySelector(limitedEscapedHref) && (href = ownerDocument.createElement("link"), setInitialProperties(href, "link", rel), markNodeAsHoistable(href), ownerDocument.head.appendChild(href)));
      }
    }
    function prefetchDNS(href) {
      previousDispatcher.D(href);
      preconnectAs("dns-prefetch", href, null);
    }
    function preconnect(href, crossOrigin) {
      previousDispatcher.C(href, crossOrigin);
      preconnectAs("preconnect", href, crossOrigin);
    }
    function preload(href, as, options2) {
      previousDispatcher.L(href, as, options2);
      var ownerDocument = globalDocument;
      if (ownerDocument && href && as) {
        var preloadSelector = 'link[rel="preload"][as="' + escapeSelectorAttributeValueInsideDoubleQuotes(as) + '"]';
        "image" === as ? options2 && options2.imageSrcSet ? (preloadSelector += '[imagesrcset="' + escapeSelectorAttributeValueInsideDoubleQuotes(
          options2.imageSrcSet
        ) + '"]', "string" === typeof options2.imageSizes && (preloadSelector += '[imagesizes="' + escapeSelectorAttributeValueInsideDoubleQuotes(
          options2.imageSizes
        ) + '"]')) : preloadSelector += '[href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]' : preloadSelector += '[href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]';
        var key = preloadSelector;
        switch (as) {
          case "style":
            key = getStyleKey(href);
            break;
          case "script":
            key = getScriptKey(href);
        }
        preloadPropsMap.has(key) || (href = assign(
          {
            rel: "preload",
            href: "image" === as && options2 && options2.imageSrcSet ? void 0 : href,
            as
          },
          options2
        ), preloadPropsMap.set(key, href), null !== ownerDocument.querySelector(preloadSelector) || "style" === as && ownerDocument.querySelector(getStylesheetSelectorFromKey(key)) || "script" === as && ownerDocument.querySelector(getScriptSelectorFromKey(key)) || (as = ownerDocument.createElement("link"), setInitialProperties(as, "link", href), markNodeAsHoistable(as), ownerDocument.head.appendChild(as)));
      }
    }
    function preloadModule(href, options2) {
      previousDispatcher.m(href, options2);
      var ownerDocument = globalDocument;
      if (ownerDocument && href) {
        var as = options2 && "string" === typeof options2.as ? options2.as : "script", preloadSelector = 'link[rel="modulepreload"][as="' + escapeSelectorAttributeValueInsideDoubleQuotes(as) + '"][href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]', key = preloadSelector;
        switch (as) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            key = getScriptKey(href);
        }
        if (!preloadPropsMap.has(key) && (href = assign({ rel: "modulepreload", href }, options2), preloadPropsMap.set(key, href), null === ownerDocument.querySelector(preloadSelector))) {
          switch (as) {
            case "audioworklet":
            case "paintworklet":
            case "serviceworker":
            case "sharedworker":
            case "worker":
            case "script":
              if (ownerDocument.querySelector(getScriptSelectorFromKey(key)))
                return;
          }
          as = ownerDocument.createElement("link");
          setInitialProperties(as, "link", href);
          markNodeAsHoistable(as);
          ownerDocument.head.appendChild(as);
        }
      }
    }
    function preinitStyle(href, precedence, options2) {
      previousDispatcher.S(href, precedence, options2);
      var ownerDocument = globalDocument;
      if (ownerDocument && href) {
        var styles = getResourcesFromRoot(ownerDocument).hoistableStyles, key = getStyleKey(href);
        precedence = precedence || "default";
        var resource = styles.get(key);
        if (!resource) {
          var state2 = { loading: 0, preload: null };
          if (resource = ownerDocument.querySelector(
            getStylesheetSelectorFromKey(key)
          ))
            state2.loading = 5;
          else {
            href = assign(
              { rel: "stylesheet", href, "data-precedence": precedence },
              options2
            );
            (options2 = preloadPropsMap.get(key)) && adoptPreloadPropsForStylesheet(href, options2);
            var link = resource = ownerDocument.createElement("link");
            markNodeAsHoistable(link);
            setInitialProperties(link, "link", href);
            link._p = new Promise(function(resolve, reject) {
              link.onload = resolve;
              link.onerror = reject;
            });
            link.addEventListener("load", function() {
              state2.loading |= 1;
            });
            link.addEventListener("error", function() {
              state2.loading |= 2;
            });
            state2.loading |= 4;
            insertStylesheet(resource, precedence, ownerDocument);
          }
          resource = {
            type: "stylesheet",
            instance: resource,
            count: 1,
            state: state2
          };
          styles.set(key, resource);
        }
      }
    }
    function preinitScript(src, options2) {
      previousDispatcher.X(src, options2);
      var ownerDocument = globalDocument;
      if (ownerDocument && src) {
        var scripts = getResourcesFromRoot(ownerDocument).hoistableScripts, key = getScriptKey(src), resource = scripts.get(key);
        resource || (resource = ownerDocument.querySelector(getScriptSelectorFromKey(key)), resource || (src = assign({ src, async: true }, options2), (options2 = preloadPropsMap.get(key)) && adoptPreloadPropsForScript(src, options2), resource = ownerDocument.createElement("script"), markNodeAsHoistable(resource), setInitialProperties(resource, "link", src), ownerDocument.head.appendChild(resource)), resource = {
          type: "script",
          instance: resource,
          count: 1,
          state: null
        }, scripts.set(key, resource));
      }
    }
    function preinitModuleScript(src, options2) {
      previousDispatcher.M(src, options2);
      var ownerDocument = globalDocument;
      if (ownerDocument && src) {
        var scripts = getResourcesFromRoot(ownerDocument).hoistableScripts, key = getScriptKey(src), resource = scripts.get(key);
        resource || (resource = ownerDocument.querySelector(getScriptSelectorFromKey(key)), resource || (src = assign({ src, async: true, type: "module" }, options2), (options2 = preloadPropsMap.get(key)) && adoptPreloadPropsForScript(src, options2), resource = ownerDocument.createElement("script"), markNodeAsHoistable(resource), setInitialProperties(resource, "link", src), ownerDocument.head.appendChild(resource)), resource = {
          type: "script",
          instance: resource,
          count: 1,
          state: null
        }, scripts.set(key, resource));
      }
    }
    function getResource(type, currentProps, pendingProps, currentResource) {
      var JSCompiler_inline_result = (JSCompiler_inline_result = rootInstanceStackCursor.current) ? getHoistableRoot(JSCompiler_inline_result) : null;
      if (!JSCompiler_inline_result) throw Error(formatProdErrorMessage(446));
      switch (type) {
        case "meta":
        case "title":
          return null;
        case "style":
          return "string" === typeof pendingProps.precedence && "string" === typeof pendingProps.href ? (currentProps = getStyleKey(pendingProps.href), pendingProps = getResourcesFromRoot(
            JSCompiler_inline_result
          ).hoistableStyles, currentResource = pendingProps.get(currentProps), currentResource || (currentResource = {
            type: "style",
            instance: null,
            count: 0,
            state: null
          }, pendingProps.set(currentProps, currentResource)), currentResource) : { type: "void", instance: null, count: 0, state: null };
        case "link":
          if ("stylesheet" === pendingProps.rel && "string" === typeof pendingProps.href && "string" === typeof pendingProps.precedence) {
            type = getStyleKey(pendingProps.href);
            var styles$243 = getResourcesFromRoot(
              JSCompiler_inline_result
            ).hoistableStyles, resource$244 = styles$243.get(type);
            resource$244 || (JSCompiler_inline_result = JSCompiler_inline_result.ownerDocument || JSCompiler_inline_result, resource$244 = {
              type: "stylesheet",
              instance: null,
              count: 0,
              state: { loading: 0, preload: null }
            }, styles$243.set(type, resource$244), (styles$243 = JSCompiler_inline_result.querySelector(
              getStylesheetSelectorFromKey(type)
            )) && !styles$243._p && (resource$244.instance = styles$243, resource$244.state.loading = 5), preloadPropsMap.has(type) || (pendingProps = {
              rel: "preload",
              as: "style",
              href: pendingProps.href,
              crossOrigin: pendingProps.crossOrigin,
              integrity: pendingProps.integrity,
              media: pendingProps.media,
              hrefLang: pendingProps.hrefLang,
              referrerPolicy: pendingProps.referrerPolicy
            }, preloadPropsMap.set(type, pendingProps), styles$243 || preloadStylesheet(
              JSCompiler_inline_result,
              type,
              pendingProps,
              resource$244.state
            )));
            if (currentProps && null === currentResource)
              throw Error(formatProdErrorMessage(528, ""));
            return resource$244;
          }
          if (currentProps && null !== currentResource)
            throw Error(formatProdErrorMessage(529, ""));
          return null;
        case "script":
          return currentProps = pendingProps.async, pendingProps = pendingProps.src, "string" === typeof pendingProps && currentProps && "function" !== typeof currentProps && "symbol" !== typeof currentProps ? (currentProps = getScriptKey(pendingProps), pendingProps = getResourcesFromRoot(
            JSCompiler_inline_result
          ).hoistableScripts, currentResource = pendingProps.get(currentProps), currentResource || (currentResource = {
            type: "script",
            instance: null,
            count: 0,
            state: null
          }, pendingProps.set(currentProps, currentResource)), currentResource) : { type: "void", instance: null, count: 0, state: null };
        default:
          throw Error(formatProdErrorMessage(444, type));
      }
    }
    function getStyleKey(href) {
      return 'href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"';
    }
    function getStylesheetSelectorFromKey(key) {
      return 'link[rel="stylesheet"][' + key + "]";
    }
    function stylesheetPropsFromRawProps(rawProps) {
      return assign({}, rawProps, {
        "data-precedence": rawProps.precedence,
        precedence: null
      });
    }
    function preloadStylesheet(ownerDocument, key, preloadProps, state2) {
      ownerDocument.querySelector('link[rel="preload"][as="style"][' + key + "]") ? state2.loading = 1 : (key = ownerDocument.createElement("link"), state2.preload = key, key.addEventListener("load", function() {
        return state2.loading |= 1;
      }), key.addEventListener("error", function() {
        return state2.loading |= 2;
      }), setInitialProperties(key, "link", preloadProps), markNodeAsHoistable(key), ownerDocument.head.appendChild(key));
    }
    function getScriptKey(src) {
      return '[src="' + escapeSelectorAttributeValueInsideDoubleQuotes(src) + '"]';
    }
    function getScriptSelectorFromKey(key) {
      return "script[async]" + key;
    }
    function acquireResource(hoistableRoot, resource, props) {
      resource.count++;
      if (null === resource.instance)
        switch (resource.type) {
          case "style":
            var instance = hoistableRoot.querySelector(
              'style[data-href~="' + escapeSelectorAttributeValueInsideDoubleQuotes(props.href) + '"]'
            );
            if (instance)
              return resource.instance = instance, markNodeAsHoistable(instance), instance;
            var styleProps = assign({}, props, {
              "data-href": props.href,
              "data-precedence": props.precedence,
              href: null,
              precedence: null
            });
            instance = (hoistableRoot.ownerDocument || hoistableRoot).createElement(
              "style"
            );
            markNodeAsHoistable(instance);
            setInitialProperties(instance, "style", styleProps);
            insertStylesheet(instance, props.precedence, hoistableRoot);
            return resource.instance = instance;
          case "stylesheet":
            styleProps = getStyleKey(props.href);
            var instance$249 = hoistableRoot.querySelector(
              getStylesheetSelectorFromKey(styleProps)
            );
            if (instance$249)
              return resource.state.loading |= 4, resource.instance = instance$249, markNodeAsHoistable(instance$249), instance$249;
            instance = stylesheetPropsFromRawProps(props);
            (styleProps = preloadPropsMap.get(styleProps)) && adoptPreloadPropsForStylesheet(instance, styleProps);
            instance$249 = (hoistableRoot.ownerDocument || hoistableRoot).createElement("link");
            markNodeAsHoistable(instance$249);
            var linkInstance = instance$249;
            linkInstance._p = new Promise(function(resolve, reject) {
              linkInstance.onload = resolve;
              linkInstance.onerror = reject;
            });
            setInitialProperties(instance$249, "link", instance);
            resource.state.loading |= 4;
            insertStylesheet(instance$249, props.precedence, hoistableRoot);
            return resource.instance = instance$249;
          case "script":
            instance$249 = getScriptKey(props.src);
            if (styleProps = hoistableRoot.querySelector(
              getScriptSelectorFromKey(instance$249)
            ))
              return resource.instance = styleProps, markNodeAsHoistable(styleProps), styleProps;
            instance = props;
            if (styleProps = preloadPropsMap.get(instance$249))
              instance = assign({}, props), adoptPreloadPropsForScript(instance, styleProps);
            hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
            styleProps = hoistableRoot.createElement("script");
            markNodeAsHoistable(styleProps);
            setInitialProperties(styleProps, "link", instance);
            hoistableRoot.head.appendChild(styleProps);
            return resource.instance = styleProps;
          case "void":
            return null;
          default:
            throw Error(formatProdErrorMessage(443, resource.type));
        }
      else
        "stylesheet" === resource.type && 0 === (resource.state.loading & 4) && (instance = resource.instance, resource.state.loading |= 4, insertStylesheet(instance, props.precedence, hoistableRoot));
      return resource.instance;
    }
    function insertStylesheet(instance, precedence, root2) {
      for (var nodes = root2.querySelectorAll(
        'link[rel="stylesheet"][data-precedence],style[data-precedence]'
      ), last = nodes.length ? nodes[nodes.length - 1] : null, prior = last, i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.dataset.precedence === precedence) prior = node;
        else if (prior !== last) break;
      }
      prior ? prior.parentNode.insertBefore(instance, prior.nextSibling) : (precedence = 9 === root2.nodeType ? root2.head : root2, precedence.insertBefore(instance, precedence.firstChild));
    }
    function adoptPreloadPropsForStylesheet(stylesheetProps, preloadProps) {
      null == stylesheetProps.crossOrigin && (stylesheetProps.crossOrigin = preloadProps.crossOrigin);
      null == stylesheetProps.referrerPolicy && (stylesheetProps.referrerPolicy = preloadProps.referrerPolicy);
      null == stylesheetProps.title && (stylesheetProps.title = preloadProps.title);
    }
    function adoptPreloadPropsForScript(scriptProps, preloadProps) {
      null == scriptProps.crossOrigin && (scriptProps.crossOrigin = preloadProps.crossOrigin);
      null == scriptProps.referrerPolicy && (scriptProps.referrerPolicy = preloadProps.referrerPolicy);
      null == scriptProps.integrity && (scriptProps.integrity = preloadProps.integrity);
    }
    var tagCaches = null;
    function getHydratableHoistableCache(type, keyAttribute, ownerDocument) {
      if (null === tagCaches) {
        var cache = /* @__PURE__ */ new Map();
        var caches = tagCaches = /* @__PURE__ */ new Map();
        caches.set(ownerDocument, cache);
      } else
        caches = tagCaches, cache = caches.get(ownerDocument), cache || (cache = /* @__PURE__ */ new Map(), caches.set(ownerDocument, cache));
      if (cache.has(type)) return cache;
      cache.set(type, null);
      ownerDocument = ownerDocument.getElementsByTagName(type);
      for (caches = 0; caches < ownerDocument.length; caches++) {
        var node = ownerDocument[caches];
        if (!(node[internalHoistableMarker] || node[internalInstanceKey] || "link" === type && "stylesheet" === node.getAttribute("rel")) && "http://www.w3.org/2000/svg" !== node.namespaceURI) {
          var nodeKey = node.getAttribute(keyAttribute) || "";
          nodeKey = type + nodeKey;
          var existing = cache.get(nodeKey);
          existing ? existing.push(node) : cache.set(nodeKey, [node]);
        }
      }
      return cache;
    }
    function mountHoistable(hoistableRoot, type, instance) {
      hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
      hoistableRoot.head.insertBefore(
        instance,
        "title" === type ? hoistableRoot.querySelector("head > title") : null
      );
    }
    function isHostHoistableType(type, props, hostContext) {
      if (1 === hostContext || null != props.itemProp) return false;
      switch (type) {
        case "meta":
        case "title":
          return true;
        case "style":
          if ("string" !== typeof props.precedence || "string" !== typeof props.href || "" === props.href)
            break;
          return true;
        case "link":
          if ("string" !== typeof props.rel || "string" !== typeof props.href || "" === props.href || props.onLoad || props.onError)
            break;
          switch (props.rel) {
            case "stylesheet":
              return type = props.disabled, "string" === typeof props.precedence && null == type;
            default:
              return true;
          }
        case "script":
          if (props.async && "function" !== typeof props.async && "symbol" !== typeof props.async && !props.onLoad && !props.onError && props.src && "string" === typeof props.src)
            return true;
      }
      return false;
    }
    function preloadResource(resource) {
      return "stylesheet" === resource.type && 0 === (resource.state.loading & 3) ? false : true;
    }
    function suspendResource(state2, hoistableRoot, resource, props) {
      if ("stylesheet" === resource.type && ("string" !== typeof props.media || false !== matchMedia(props.media).matches) && 0 === (resource.state.loading & 4)) {
        if (null === resource.instance) {
          var key = getStyleKey(props.href), instance = hoistableRoot.querySelector(
            getStylesheetSelectorFromKey(key)
          );
          if (instance) {
            hoistableRoot = instance._p;
            null !== hoistableRoot && "object" === typeof hoistableRoot && "function" === typeof hoistableRoot.then && (state2.count++, state2 = onUnsuspend.bind(state2), hoistableRoot.then(state2, state2));
            resource.state.loading |= 4;
            resource.instance = instance;
            markNodeAsHoistable(instance);
            return;
          }
          instance = hoistableRoot.ownerDocument || hoistableRoot;
          props = stylesheetPropsFromRawProps(props);
          (key = preloadPropsMap.get(key)) && adoptPreloadPropsForStylesheet(props, key);
          instance = instance.createElement("link");
          markNodeAsHoistable(instance);
          var linkInstance = instance;
          linkInstance._p = new Promise(function(resolve, reject) {
            linkInstance.onload = resolve;
            linkInstance.onerror = reject;
          });
          setInitialProperties(instance, "link", props);
          resource.instance = instance;
        }
        null === state2.stylesheets && (state2.stylesheets = /* @__PURE__ */ new Map());
        state2.stylesheets.set(resource, hoistableRoot);
        (hoistableRoot = resource.state.preload) && 0 === (resource.state.loading & 3) && (state2.count++, resource = onUnsuspend.bind(state2), hoistableRoot.addEventListener("load", resource), hoistableRoot.addEventListener("error", resource));
      }
    }
    var estimatedBytesWithinLimit = 0;
    function waitForCommitToBeReady(state2, timeoutOffset) {
      state2.stylesheets && 0 === state2.count && insertSuspendedStylesheets(state2, state2.stylesheets);
      return 0 < state2.count || 0 < state2.imgCount ? function(commit) {
        var stylesheetTimer = setTimeout(function() {
          state2.stylesheets && insertSuspendedStylesheets(state2, state2.stylesheets);
          if (state2.unsuspend) {
            var unsuspend = state2.unsuspend;
            state2.unsuspend = null;
            unsuspend();
          }
        }, 6e4 + timeoutOffset);
        0 < state2.imgBytes && 0 === estimatedBytesWithinLimit && (estimatedBytesWithinLimit = 62500 * estimateBandwidth());
        var imgTimer = setTimeout(
          function() {
            state2.waitingForImages = false;
            if (0 === state2.count && (state2.stylesheets && insertSuspendedStylesheets(state2, state2.stylesheets), state2.unsuspend)) {
              var unsuspend = state2.unsuspend;
              state2.unsuspend = null;
              unsuspend();
            }
          },
          (state2.imgBytes > estimatedBytesWithinLimit ? 50 : 800) + timeoutOffset
        );
        state2.unsuspend = commit;
        return function() {
          state2.unsuspend = null;
          clearTimeout(stylesheetTimer);
          clearTimeout(imgTimer);
        };
      } : null;
    }
    function onUnsuspend() {
      this.count--;
      if (0 === this.count && (0 === this.imgCount || !this.waitingForImages)) {
        if (this.stylesheets) insertSuspendedStylesheets(this, this.stylesheets);
        else if (this.unsuspend) {
          var unsuspend = this.unsuspend;
          this.unsuspend = null;
          unsuspend();
        }
      }
    }
    var precedencesByRoot = null;
    function insertSuspendedStylesheets(state2, resources) {
      state2.stylesheets = null;
      null !== state2.unsuspend && (state2.count++, precedencesByRoot = /* @__PURE__ */ new Map(), resources.forEach(insertStylesheetIntoRoot, state2), precedencesByRoot = null, onUnsuspend.call(state2));
    }
    function insertStylesheetIntoRoot(root2, resource) {
      if (!(resource.state.loading & 4)) {
        var precedences = precedencesByRoot.get(root2);
        if (precedences) var last = precedences.get(null);
        else {
          precedences = /* @__PURE__ */ new Map();
          precedencesByRoot.set(root2, precedences);
          for (var nodes = root2.querySelectorAll(
            "link[data-precedence],style[data-precedence]"
          ), i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if ("LINK" === node.nodeName || "not all" !== node.getAttribute("media"))
              precedences.set(node.dataset.precedence, node), last = node;
          }
          last && precedences.set(null, last);
        }
        nodes = resource.instance;
        node = nodes.getAttribute("data-precedence");
        i = precedences.get(node) || last;
        i === last && precedences.set(null, nodes);
        precedences.set(node, nodes);
        this.count++;
        last = onUnsuspend.bind(this);
        nodes.addEventListener("load", last);
        nodes.addEventListener("error", last);
        i ? i.parentNode.insertBefore(nodes, i.nextSibling) : (root2 = 9 === root2.nodeType ? root2.head : root2, root2.insertBefore(nodes, root2.firstChild));
        resource.state.loading |= 4;
      }
    }
    var HostTransitionContext = {
      $$typeof: REACT_CONTEXT_TYPE,
      Provider: null,
      Consumer: null,
      _currentValue: sharedNotPendingObject,
      _currentValue2: sharedNotPendingObject,
      _threadCount: 0
    };
    function FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator, formState) {
      this.tag = 1;
      this.containerInfo = containerInfo;
      this.pingCache = this.current = this.pendingChildren = null;
      this.timeoutHandle = -1;
      this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null;
      this.callbackPriority = 0;
      this.expirationTimes = createLaneMap(-1);
      this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
      this.entanglements = createLaneMap(0);
      this.hiddenUpdates = createLaneMap(null);
      this.identifierPrefix = identifierPrefix;
      this.onUncaughtError = onUncaughtError;
      this.onCaughtError = onCaughtError;
      this.onRecoverableError = onRecoverableError;
      this.pooledCache = null;
      this.pooledCacheLanes = 0;
      this.formState = formState;
      this.incompleteTransitions = /* @__PURE__ */ new Map();
    }
    function createFiberRoot(containerInfo, tag, hydrate, initialChildren, hydrationCallbacks, isStrictMode, identifierPrefix, formState, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator) {
      containerInfo = new FiberRootNode(
        containerInfo,
        tag,
        hydrate,
        identifierPrefix,
        onUncaughtError,
        onCaughtError,
        onRecoverableError,
        onDefaultTransitionIndicator,
        formState
      );
      tag = 1;
      true === isStrictMode && (tag |= 24);
      isStrictMode = createFiberImplClass(3, null, null, tag);
      containerInfo.current = isStrictMode;
      isStrictMode.stateNode = containerInfo;
      tag = createCache();
      tag.refCount++;
      containerInfo.pooledCache = tag;
      tag.refCount++;
      isStrictMode.memoizedState = {
        element: initialChildren,
        isDehydrated: hydrate,
        cache: tag
      };
      initializeUpdateQueue(isStrictMode);
      return containerInfo;
    }
    function getContextForSubtree(parentComponent) {
      if (!parentComponent) return emptyContextObject;
      parentComponent = emptyContextObject;
      return parentComponent;
    }
    function updateContainerImpl(rootFiber, lane, element, container, parentComponent, callback) {
      parentComponent = getContextForSubtree(parentComponent);
      null === container.context ? container.context = parentComponent : container.pendingContext = parentComponent;
      container = createUpdate(lane);
      container.payload = { element };
      callback = void 0 === callback ? null : callback;
      null !== callback && (container.callback = callback);
      element = enqueueUpdate(rootFiber, container, lane);
      null !== element && (scheduleUpdateOnFiber(element, rootFiber, lane), entangleTransitions(element, rootFiber, lane));
    }
    function markRetryLaneImpl(fiber, retryLane) {
      fiber = fiber.memoizedState;
      if (null !== fiber && null !== fiber.dehydrated) {
        var a = fiber.retryLane;
        fiber.retryLane = 0 !== a && a < retryLane ? a : retryLane;
      }
    }
    function markRetryLaneIfNotHydrated(fiber, retryLane) {
      markRetryLaneImpl(fiber, retryLane);
      (fiber = fiber.alternate) && markRetryLaneImpl(fiber, retryLane);
    }
    function attemptContinuousHydration(fiber) {
      if (13 === fiber.tag || 31 === fiber.tag) {
        var root2 = enqueueConcurrentRenderForLane(fiber, 67108864);
        null !== root2 && scheduleUpdateOnFiber(root2, fiber, 67108864);
        markRetryLaneIfNotHydrated(fiber, 67108864);
      }
    }
    function attemptHydrationAtCurrentPriority(fiber) {
      if (13 === fiber.tag || 31 === fiber.tag) {
        var lane = requestUpdateLane();
        lane = getBumpedLaneForHydrationByLane(lane);
        var root2 = enqueueConcurrentRenderForLane(fiber, lane);
        null !== root2 && scheduleUpdateOnFiber(root2, fiber, lane);
        markRetryLaneIfNotHydrated(fiber, lane);
      }
    }
    var _enabled = true;
    function dispatchDiscreteEvent(domEventName, eventSystemFlags, container, nativeEvent) {
      var prevTransition = ReactSharedInternals.T;
      ReactSharedInternals.T = null;
      var previousPriority = ReactDOMSharedInternals.p;
      try {
        ReactDOMSharedInternals.p = 2, dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
      } finally {
        ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition;
      }
    }
    function dispatchContinuousEvent(domEventName, eventSystemFlags, container, nativeEvent) {
      var prevTransition = ReactSharedInternals.T;
      ReactSharedInternals.T = null;
      var previousPriority = ReactDOMSharedInternals.p;
      try {
        ReactDOMSharedInternals.p = 8, dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
      } finally {
        ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition;
      }
    }
    function dispatchEvent(domEventName, eventSystemFlags, targetContainer, nativeEvent) {
      if (_enabled) {
        var blockedOn = findInstanceBlockingEvent(nativeEvent);
        if (null === blockedOn)
          dispatchEventForPluginEventSystem(
            domEventName,
            eventSystemFlags,
            nativeEvent,
            return_targetInst,
            targetContainer
          ), clearIfContinuousEvent(domEventName, nativeEvent);
        else if (queueIfContinuousEvent(
          blockedOn,
          domEventName,
          eventSystemFlags,
          targetContainer,
          nativeEvent
        ))
          nativeEvent.stopPropagation();
        else if (clearIfContinuousEvent(domEventName, nativeEvent), eventSystemFlags & 4 && -1 < discreteReplayableEvents.indexOf(domEventName)) {
          for (; null !== blockedOn; ) {
            var fiber = getInstanceFromNode(blockedOn);
            if (null !== fiber)
              switch (fiber.tag) {
                case 3:
                  fiber = fiber.stateNode;
                  if (fiber.current.memoizedState.isDehydrated) {
                    var lanes = getHighestPriorityLanes(fiber.pendingLanes);
                    if (0 !== lanes) {
                      var root2 = fiber;
                      root2.pendingLanes |= 2;
                      for (root2.entangledLanes |= 2; lanes; ) {
                        var lane = 1 << 31 - clz32(lanes);
                        root2.entanglements[1] |= lane;
                        lanes &= ~lane;
                      }
                      ensureRootIsScheduled(fiber);
                      0 === (executionContext & 6) && (workInProgressRootRenderTargetTime = now() + 500, flushSyncWorkAcrossRoots_impl(0, false));
                    }
                  }
                  break;
                case 31:
                case 13:
                  root2 = enqueueConcurrentRenderForLane(fiber, 2), null !== root2 && scheduleUpdateOnFiber(root2, fiber, 2), flushSyncWork$1(), markRetryLaneIfNotHydrated(fiber, 2);
              }
            fiber = findInstanceBlockingEvent(nativeEvent);
            null === fiber && dispatchEventForPluginEventSystem(
              domEventName,
              eventSystemFlags,
              nativeEvent,
              return_targetInst,
              targetContainer
            );
            if (fiber === blockedOn) break;
            blockedOn = fiber;
          }
          null !== blockedOn && nativeEvent.stopPropagation();
        } else
          dispatchEventForPluginEventSystem(
            domEventName,
            eventSystemFlags,
            nativeEvent,
            null,
            targetContainer
          );
      }
    }
    function findInstanceBlockingEvent(nativeEvent) {
      nativeEvent = getEventTarget(nativeEvent);
      return findInstanceBlockingTarget(nativeEvent);
    }
    var return_targetInst = null;
    function findInstanceBlockingTarget(targetNode) {
      return_targetInst = null;
      targetNode = getClosestInstanceFromNode(targetNode);
      if (null !== targetNode) {
        var nearestMounted = getNearestMountedFiber(targetNode);
        if (null === nearestMounted) targetNode = null;
        else {
          var tag = nearestMounted.tag;
          if (13 === tag) {
            targetNode = getSuspenseInstanceFromFiber(nearestMounted);
            if (null !== targetNode) return targetNode;
            targetNode = null;
          } else if (31 === tag) {
            targetNode = getActivityInstanceFromFiber(nearestMounted);
            if (null !== targetNode) return targetNode;
            targetNode = null;
          } else if (3 === tag) {
            if (nearestMounted.stateNode.current.memoizedState.isDehydrated)
              return 3 === nearestMounted.tag ? nearestMounted.stateNode.containerInfo : null;
            targetNode = null;
          } else nearestMounted !== targetNode && (targetNode = null);
        }
      }
      return_targetInst = targetNode;
      return null;
    }
    function getEventPriority(domEventName) {
      switch (domEventName) {
        case "beforetoggle":
        case "cancel":
        case "click":
        case "close":
        case "contextmenu":
        case "copy":
        case "cut":
        case "auxclick":
        case "dblclick":
        case "dragend":
        case "dragstart":
        case "drop":
        case "focusin":
        case "focusout":
        case "input":
        case "invalid":
        case "keydown":
        case "keypress":
        case "keyup":
        case "mousedown":
        case "mouseup":
        case "paste":
        case "pause":
        case "play":
        case "pointercancel":
        case "pointerdown":
        case "pointerup":
        case "ratechange":
        case "reset":
        case "resize":
        case "seeked":
        case "submit":
        case "toggle":
        case "touchcancel":
        case "touchend":
        case "touchstart":
        case "volumechange":
        case "change":
        case "selectionchange":
        case "textInput":
        case "compositionstart":
        case "compositionend":
        case "compositionupdate":
        case "beforeblur":
        case "afterblur":
        case "beforeinput":
        case "blur":
        case "fullscreenchange":
        case "focus":
        case "hashchange":
        case "popstate":
        case "select":
        case "selectstart":
          return 2;
        case "drag":
        case "dragenter":
        case "dragexit":
        case "dragleave":
        case "dragover":
        case "mousemove":
        case "mouseout":
        case "mouseover":
        case "pointermove":
        case "pointerout":
        case "pointerover":
        case "scroll":
        case "touchmove":
        case "wheel":
        case "mouseenter":
        case "mouseleave":
        case "pointerenter":
        case "pointerleave":
          return 8;
        case "message":
          switch (getCurrentPriorityLevel()) {
            case ImmediatePriority:
              return 2;
            case UserBlockingPriority:
              return 8;
            case NormalPriority$1:
            case LowPriority:
              return 32;
            case IdlePriority:
              return 268435456;
            default:
              return 32;
          }
        default:
          return 32;
      }
    }
    var hasScheduledReplayAttempt = false;
    var queuedFocus = null;
    var queuedDrag = null;
    var queuedMouse = null;
    var queuedPointers = /* @__PURE__ */ new Map();
    var queuedPointerCaptures = /* @__PURE__ */ new Map();
    var queuedExplicitHydrationTargets = [];
    var discreteReplayableEvents = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
      " "
    );
    function clearIfContinuousEvent(domEventName, nativeEvent) {
      switch (domEventName) {
        case "focusin":
        case "focusout":
          queuedFocus = null;
          break;
        case "dragenter":
        case "dragleave":
          queuedDrag = null;
          break;
        case "mouseover":
        case "mouseout":
          queuedMouse = null;
          break;
        case "pointerover":
        case "pointerout":
          queuedPointers.delete(nativeEvent.pointerId);
          break;
        case "gotpointercapture":
        case "lostpointercapture":
          queuedPointerCaptures.delete(nativeEvent.pointerId);
      }
    }
    function accumulateOrCreateContinuousQueuedReplayableEvent(existingQueuedEvent, blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
      if (null === existingQueuedEvent || existingQueuedEvent.nativeEvent !== nativeEvent)
        return existingQueuedEvent = {
          blockedOn,
          domEventName,
          eventSystemFlags,
          nativeEvent,
          targetContainers: [targetContainer]
        }, null !== blockedOn && (blockedOn = getInstanceFromNode(blockedOn), null !== blockedOn && attemptContinuousHydration(blockedOn)), existingQueuedEvent;
      existingQueuedEvent.eventSystemFlags |= eventSystemFlags;
      blockedOn = existingQueuedEvent.targetContainers;
      null !== targetContainer && -1 === blockedOn.indexOf(targetContainer) && blockedOn.push(targetContainer);
      return existingQueuedEvent;
    }
    function queueIfContinuousEvent(blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
      switch (domEventName) {
        case "focusin":
          return queuedFocus = accumulateOrCreateContinuousQueuedReplayableEvent(
            queuedFocus,
            blockedOn,
            domEventName,
            eventSystemFlags,
            targetContainer,
            nativeEvent
          ), true;
        case "dragenter":
          return queuedDrag = accumulateOrCreateContinuousQueuedReplayableEvent(
            queuedDrag,
            blockedOn,
            domEventName,
            eventSystemFlags,
            targetContainer,
            nativeEvent
          ), true;
        case "mouseover":
          return queuedMouse = accumulateOrCreateContinuousQueuedReplayableEvent(
            queuedMouse,
            blockedOn,
            domEventName,
            eventSystemFlags,
            targetContainer,
            nativeEvent
          ), true;
        case "pointerover":
          var pointerId = nativeEvent.pointerId;
          queuedPointers.set(
            pointerId,
            accumulateOrCreateContinuousQueuedReplayableEvent(
              queuedPointers.get(pointerId) || null,
              blockedOn,
              domEventName,
              eventSystemFlags,
              targetContainer,
              nativeEvent
            )
          );
          return true;
        case "gotpointercapture":
          return pointerId = nativeEvent.pointerId, queuedPointerCaptures.set(
            pointerId,
            accumulateOrCreateContinuousQueuedReplayableEvent(
              queuedPointerCaptures.get(pointerId) || null,
              blockedOn,
              domEventName,
              eventSystemFlags,
              targetContainer,
              nativeEvent
            )
          ), true;
      }
      return false;
    }
    function attemptExplicitHydrationTarget(queuedTarget) {
      var targetInst = getClosestInstanceFromNode(queuedTarget.target);
      if (null !== targetInst) {
        var nearestMounted = getNearestMountedFiber(targetInst);
        if (null !== nearestMounted) {
          if (targetInst = nearestMounted.tag, 13 === targetInst) {
            if (targetInst = getSuspenseInstanceFromFiber(nearestMounted), null !== targetInst) {
              queuedTarget.blockedOn = targetInst;
              runWithPriority(queuedTarget.priority, function() {
                attemptHydrationAtCurrentPriority(nearestMounted);
              });
              return;
            }
          } else if (31 === targetInst) {
            if (targetInst = getActivityInstanceFromFiber(nearestMounted), null !== targetInst) {
              queuedTarget.blockedOn = targetInst;
              runWithPriority(queuedTarget.priority, function() {
                attemptHydrationAtCurrentPriority(nearestMounted);
              });
              return;
            }
          } else if (3 === targetInst && nearestMounted.stateNode.current.memoizedState.isDehydrated) {
            queuedTarget.blockedOn = 3 === nearestMounted.tag ? nearestMounted.stateNode.containerInfo : null;
            return;
          }
        }
      }
      queuedTarget.blockedOn = null;
    }
    function attemptReplayContinuousQueuedEvent(queuedEvent) {
      if (null !== queuedEvent.blockedOn) return false;
      for (var targetContainers = queuedEvent.targetContainers; 0 < targetContainers.length; ) {
        var nextBlockedOn = findInstanceBlockingEvent(queuedEvent.nativeEvent);
        if (null === nextBlockedOn) {
          nextBlockedOn = queuedEvent.nativeEvent;
          var nativeEventClone = new nextBlockedOn.constructor(
            nextBlockedOn.type,
            nextBlockedOn
          );
          currentReplayingEvent = nativeEventClone;
          nextBlockedOn.target.dispatchEvent(nativeEventClone);
          currentReplayingEvent = null;
        } else
          return targetContainers = getInstanceFromNode(nextBlockedOn), null !== targetContainers && attemptContinuousHydration(targetContainers), queuedEvent.blockedOn = nextBlockedOn, false;
        targetContainers.shift();
      }
      return true;
    }
    function attemptReplayContinuousQueuedEventInMap(queuedEvent, key, map) {
      attemptReplayContinuousQueuedEvent(queuedEvent) && map.delete(key);
    }
    function replayUnblockedEvents() {
      hasScheduledReplayAttempt = false;
      null !== queuedFocus && attemptReplayContinuousQueuedEvent(queuedFocus) && (queuedFocus = null);
      null !== queuedDrag && attemptReplayContinuousQueuedEvent(queuedDrag) && (queuedDrag = null);
      null !== queuedMouse && attemptReplayContinuousQueuedEvent(queuedMouse) && (queuedMouse = null);
      queuedPointers.forEach(attemptReplayContinuousQueuedEventInMap);
      queuedPointerCaptures.forEach(attemptReplayContinuousQueuedEventInMap);
    }
    function scheduleCallbackIfUnblocked(queuedEvent, unblocked) {
      queuedEvent.blockedOn === unblocked && (queuedEvent.blockedOn = null, hasScheduledReplayAttempt || (hasScheduledReplayAttempt = true, Scheduler.unstable_scheduleCallback(
        Scheduler.unstable_NormalPriority,
        replayUnblockedEvents
      )));
    }
    var lastScheduledReplayQueue = null;
    function scheduleReplayQueueIfNeeded(formReplayingQueue) {
      lastScheduledReplayQueue !== formReplayingQueue && (lastScheduledReplayQueue = formReplayingQueue, Scheduler.unstable_scheduleCallback(
        Scheduler.unstable_NormalPriority,
        function() {
          lastScheduledReplayQueue === formReplayingQueue && (lastScheduledReplayQueue = null);
          for (var i = 0; i < formReplayingQueue.length; i += 3) {
            var form = formReplayingQueue[i], submitterOrAction = formReplayingQueue[i + 1], formData = formReplayingQueue[i + 2];
            if ("function" !== typeof submitterOrAction)
              if (null === findInstanceBlockingTarget(submitterOrAction || form))
                continue;
              else break;
            var formInst = getInstanceFromNode(form);
            null !== formInst && (formReplayingQueue.splice(i, 3), i -= 3, startHostTransition(
              formInst,
              {
                pending: true,
                data: formData,
                method: form.method,
                action: submitterOrAction
              },
              submitterOrAction,
              formData
            ));
          }
        }
      ));
    }
    function retryIfBlockedOn(unblocked) {
      function unblock(queuedEvent) {
        return scheduleCallbackIfUnblocked(queuedEvent, unblocked);
      }
      null !== queuedFocus && scheduleCallbackIfUnblocked(queuedFocus, unblocked);
      null !== queuedDrag && scheduleCallbackIfUnblocked(queuedDrag, unblocked);
      null !== queuedMouse && scheduleCallbackIfUnblocked(queuedMouse, unblocked);
      queuedPointers.forEach(unblock);
      queuedPointerCaptures.forEach(unblock);
      for (var i = 0; i < queuedExplicitHydrationTargets.length; i++) {
        var queuedTarget = queuedExplicitHydrationTargets[i];
        queuedTarget.blockedOn === unblocked && (queuedTarget.blockedOn = null);
      }
      for (; 0 < queuedExplicitHydrationTargets.length && (i = queuedExplicitHydrationTargets[0], null === i.blockedOn); )
        attemptExplicitHydrationTarget(i), null === i.blockedOn && queuedExplicitHydrationTargets.shift();
      i = (unblocked.ownerDocument || unblocked).$$reactFormReplay;
      if (null != i)
        for (queuedTarget = 0; queuedTarget < i.length; queuedTarget += 3) {
          var form = i[queuedTarget], submitterOrAction = i[queuedTarget + 1], formProps = form[internalPropsKey] || null;
          if ("function" === typeof submitterOrAction)
            formProps || scheduleReplayQueueIfNeeded(i);
          else if (formProps) {
            var action = null;
            if (submitterOrAction && submitterOrAction.hasAttribute("formAction"))
              if (form = submitterOrAction, formProps = submitterOrAction[internalPropsKey] || null)
                action = formProps.formAction;
              else {
                if (null !== findInstanceBlockingTarget(form)) continue;
              }
            else action = formProps.action;
            "function" === typeof action ? i[queuedTarget + 1] = action : (i.splice(queuedTarget, 3), queuedTarget -= 3);
            scheduleReplayQueueIfNeeded(i);
          }
        }
    }
    function defaultOnDefaultTransitionIndicator() {
      function handleNavigate(event) {
        event.canIntercept && "react-transition" === event.info && event.intercept({
          handler: function() {
            return new Promise(function(resolve) {
              return pendingResolve = resolve;
            });
          },
          focusReset: "manual",
          scroll: "manual"
        });
      }
      function handleNavigateComplete() {
        null !== pendingResolve && (pendingResolve(), pendingResolve = null);
        isCancelled || setTimeout(startFakeNavigation, 20);
      }
      function startFakeNavigation() {
        if (!isCancelled && !navigation.transition) {
          var currentEntry = navigation.currentEntry;
          currentEntry && null != currentEntry.url && navigation.navigate(currentEntry.url, {
            state: currentEntry.getState(),
            info: "react-transition",
            history: "replace"
          });
        }
      }
      if ("object" === typeof navigation) {
        var isCancelled = false, pendingResolve = null;
        navigation.addEventListener("navigate", handleNavigate);
        navigation.addEventListener("navigatesuccess", handleNavigateComplete);
        navigation.addEventListener("navigateerror", handleNavigateComplete);
        setTimeout(startFakeNavigation, 100);
        return function() {
          isCancelled = true;
          navigation.removeEventListener("navigate", handleNavigate);
          navigation.removeEventListener("navigatesuccess", handleNavigateComplete);
          navigation.removeEventListener("navigateerror", handleNavigateComplete);
          null !== pendingResolve && (pendingResolve(), pendingResolve = null);
        };
      }
    }
    function ReactDOMRoot(internalRoot) {
      this._internalRoot = internalRoot;
    }
    ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render = function(children) {
      var root2 = this._internalRoot;
      if (null === root2) throw Error(formatProdErrorMessage(409));
      var current = root2.current, lane = requestUpdateLane();
      updateContainerImpl(current, lane, children, root2, null, null);
    };
    ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount = function() {
      var root2 = this._internalRoot;
      if (null !== root2) {
        this._internalRoot = null;
        var container = root2.containerInfo;
        updateContainerImpl(root2.current, 2, null, root2, null, null);
        flushSyncWork$1();
        container[internalContainerInstanceKey] = null;
      }
    };
    function ReactDOMHydrationRoot(internalRoot) {
      this._internalRoot = internalRoot;
    }
    ReactDOMHydrationRoot.prototype.unstable_scheduleHydration = function(target) {
      if (target) {
        var updatePriority = resolveUpdatePriority();
        target = { blockedOn: null, target, priority: updatePriority };
        for (var i = 0; i < queuedExplicitHydrationTargets.length && 0 !== updatePriority && updatePriority < queuedExplicitHydrationTargets[i].priority; i++) ;
        queuedExplicitHydrationTargets.splice(i, 0, target);
        0 === i && attemptExplicitHydrationTarget(target);
      }
    };
    var isomorphicReactPackageVersion$jscomp$inline_1840 = React22.version;
    if ("19.2.4" !== isomorphicReactPackageVersion$jscomp$inline_1840)
      throw Error(
        formatProdErrorMessage(
          527,
          isomorphicReactPackageVersion$jscomp$inline_1840,
          "19.2.4"
        )
      );
    ReactDOMSharedInternals.findDOMNode = function(componentOrElement) {
      var fiber = componentOrElement._reactInternals;
      if (void 0 === fiber) {
        if ("function" === typeof componentOrElement.render)
          throw Error(formatProdErrorMessage(188));
        componentOrElement = Object.keys(componentOrElement).join(",");
        throw Error(formatProdErrorMessage(268, componentOrElement));
      }
      componentOrElement = findCurrentFiberUsingSlowPath(fiber);
      componentOrElement = null !== componentOrElement ? findCurrentHostFiberImpl(componentOrElement) : null;
      componentOrElement = null === componentOrElement ? null : componentOrElement.stateNode;
      return componentOrElement;
    };
    var internals$jscomp$inline_2347 = {
      bundleType: 0,
      version: "19.2.4",
      rendererPackageName: "react-dom",
      currentDispatcherRef: ReactSharedInternals,
      reconcilerVersion: "19.2.4"
    };
    if ("undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) {
      hook$jscomp$inline_2348 = __REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook$jscomp$inline_2348.isDisabled && hook$jscomp$inline_2348.supportsFiber)
        try {
          rendererID = hook$jscomp$inline_2348.inject(
            internals$jscomp$inline_2347
          ), injectedHook = hook$jscomp$inline_2348;
        } catch (err) {
        }
    }
    var hook$jscomp$inline_2348;
    exports.createRoot = function(container, options2) {
      if (!isValidContainer(container)) throw Error(formatProdErrorMessage(299));
      var isStrictMode = false, identifierPrefix = "", onUncaughtError = defaultOnUncaughtError, onCaughtError = defaultOnCaughtError, onRecoverableError = defaultOnRecoverableError;
      null !== options2 && void 0 !== options2 && (true === options2.unstable_strictMode && (isStrictMode = true), void 0 !== options2.identifierPrefix && (identifierPrefix = options2.identifierPrefix), void 0 !== options2.onUncaughtError && (onUncaughtError = options2.onUncaughtError), void 0 !== options2.onCaughtError && (onCaughtError = options2.onCaughtError), void 0 !== options2.onRecoverableError && (onRecoverableError = options2.onRecoverableError));
      options2 = createFiberRoot(
        container,
        1,
        false,
        null,
        null,
        isStrictMode,
        identifierPrefix,
        null,
        onUncaughtError,
        onCaughtError,
        onRecoverableError,
        defaultOnDefaultTransitionIndicator
      );
      container[internalContainerInstanceKey] = options2.current;
      listenToAllSupportedEvents(container);
      return new ReactDOMRoot(options2);
    };
    exports.hydrateRoot = function(container, initialChildren, options2) {
      if (!isValidContainer(container)) throw Error(formatProdErrorMessage(299));
      var isStrictMode = false, identifierPrefix = "", onUncaughtError = defaultOnUncaughtError, onCaughtError = defaultOnCaughtError, onRecoverableError = defaultOnRecoverableError, formState = null;
      null !== options2 && void 0 !== options2 && (true === options2.unstable_strictMode && (isStrictMode = true), void 0 !== options2.identifierPrefix && (identifierPrefix = options2.identifierPrefix), void 0 !== options2.onUncaughtError && (onUncaughtError = options2.onUncaughtError), void 0 !== options2.onCaughtError && (onCaughtError = options2.onCaughtError), void 0 !== options2.onRecoverableError && (onRecoverableError = options2.onRecoverableError), void 0 !== options2.formState && (formState = options2.formState));
      initialChildren = createFiberRoot(
        container,
        1,
        true,
        initialChildren,
        null != options2 ? options2 : null,
        isStrictMode,
        identifierPrefix,
        formState,
        onUncaughtError,
        onCaughtError,
        onRecoverableError,
        defaultOnDefaultTransitionIndicator
      );
      initialChildren.context = getContextForSubtree(null);
      options2 = initialChildren.current;
      isStrictMode = requestUpdateLane();
      isStrictMode = getBumpedLaneForHydrationByLane(isStrictMode);
      identifierPrefix = createUpdate(isStrictMode);
      identifierPrefix.callback = null;
      enqueueUpdate(options2, identifierPrefix, isStrictMode);
      options2 = isStrictMode;
      initialChildren.current.lanes = options2;
      markRootUpdated$1(initialChildren, options2);
      ensureRootIsScheduled(initialChildren);
      container[internalContainerInstanceKey] = initialChildren.current;
      listenToAllSupportedEvents(container);
      return new ReactDOMHydrationRoot(initialChildren);
    };
    exports.version = "19.2.4";
  }
});

// node_modules/react-dom/client.js
var require_client = __commonJS({
  "node_modules/react-dom/client.js"(exports, module) {
    "use strict";
    function checkDCE() {
      if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
        return;
      }
      if (false) {
        throw new Error("^_^");
      }
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
      } catch (err) {
        console.error(err);
      }
    }
    if (true) {
      checkDCE();
      module.exports = require_react_dom_client_production();
    } else {
      module.exports = null;
    }
  }
});

// src/vendor/react.js
var react_exports = {};
__export(react_exports, {
  default: () => import_react.default
});
var import_react = __toESM(require_react(), 1);
__reExport(react_exports, __toESM(require_react(), 1));

// src/vendor/react-dom-client.js
var import_client = __toESM(require_client(), 1);

// src/config.js
var REDROB_CONSOLE_URL = "https://console.redrob.ai";
var GATEWAY_PATH = "/api/backend";
function gatewayOriginFor(location2) {
  const servedOverHttp = location2?.protocol === "http:" || location2?.protocol === "https:";
  return servedOverHttp ? location2.origin : REDROB_CONSOLE_URL;
}
var REDROB_API_BASE_URL = `${gatewayOriginFor(globalThis.location)}${GATEWAY_PATH}`;
var REDROB_COMPLETIONS_URL = `${REDROB_API_BASE_URL}/v1/chat/completions`;
var REDROB_MODELS_URL = `${REDROB_API_BASE_URL}/v1/models`;
var REDROB_DEFAULT_MODEL = "auto";
var REDROB_BROWSER_ID = "ai.redrob.browser";
var NATIVE_HOST_CANDIDATES = [
  { name: REDROB_BROWSER_ID, label: "Desktop" },
  { name: `${REDROB_BROWSER_ID}.code`, label: "Redrob Code" }
];
var STORAGE_KEYS = {
  apiKey: "redrobApiKey"
};
var LEGACY_API_KEY_STORAGE_KEY = "anthropicApiKey";

// src/storage/api-key.js
function localStorageArea(storage) {
  return storage || globalThis.chrome?.storage?.local;
}
async function readStoredApiKey(storage) {
  const area = localStorageArea(storage);
  if (!area?.get) return "";
  const result = await area.get([
    STORAGE_KEYS.apiKey,
    LEGACY_API_KEY_STORAGE_KEY
  ]);
  const current = result[STORAGE_KEYS.apiKey];
  if (current) return String(current);
  const legacy = result[LEGACY_API_KEY_STORAGE_KEY];
  if (!legacy) return "";
  if (area.set) await area.set({ [STORAGE_KEYS.apiKey]: legacy });
  if (area.remove) await area.remove(LEGACY_API_KEY_STORAGE_KEY);
  return String(legacy);
}
async function persistApiKey(apiKey, storage) {
  const area = localStorageArea(storage);
  await area.set({ [STORAGE_KEYS.apiKey]: apiKey });
  await area.remove(LEGACY_API_KEY_STORAGE_KEY);
}

// src/i18n/first-party-copy.js
var COPY = {
  "en-US": {
    locale: "en-US",
    getKey: "Get API key",
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "e.g. rrk_a1b2c3d4e5f6",
    settingsTitle: "API key",
    settingsBody: "Change the key Redrob uses for this browser.",
    settingsHint: "A key is already saved. Enter a new one to replace it.",
    accountTitle: "Account",
    accountBody: "Manage the API key connected to this browser.",
    apiKeyHelp: "Paste a Redrob API key issued from the console.",
    savedKeyLabel: "Saved key",
    keyConnected: "Connected",
    keyNotConfigured: "Not configured",
    deleteKey: "Delete key",
    dangerTitle: "Remove API key",
    dangerBody: "Deleting the key disables chat until another key is saved.",
    deleteTitle: "Delete this API key?",
    deleteBody: "Redrob will stop working in this browser until you add another key.",
    deleteConfirm: "Delete key",
    cancel: "Cancel",
    deleted: "The API key was deleted.",
    permissionGranted: "Allowed",
    permissionBlocked: "Blocked",
    permissionNotRequested: "Not requested",
    saveKey: "Save API key",
    checking: "Checking...",
    keyRejected: "That key was rejected. Check it and try again.",
    keyUnreachable: "Could not reach Redrob. Try again in a moment.",
    saving: "Saving...",
    saved: "Saved. New chats will use this key.",
    onboardingTitle: "Redrob can now control your browser",
    onboardingBody: "It acts in your browser on your behalf.",
    onboardingRiskInjection: "Pages can hide instructions that trick it.",
    onboardingRiskPrivacy: "It reads your tabs and takes screenshots.",
    onboardingRiskOversight: "Keep an eye on it and stop anything wrong.",
    onboardingAccept: "I understand",
    allowOnce: "Allow once",
    allowSite: (host) => `Always allow on ${host}`,
    approvedSitesTitle: "Approved sites",
    approvedSitesBody: "Redrob acts on these sites without asking. Everything else still prompts.",
    approvedSitesEmpty: "No sites approved yet.",
    revokeSite: "Revoke",
    moreOptions: "More options",
    exportConversation: "Export conversation",
    copyMessage: "Copy message",
    copied: "Copied",
    memoryTitle: "Memory",
    memoryBody: "Facts Redrob has kept about you. They stay on this machine and ride along with your requests.",
    memoryEmpty: "Nothing remembered yet.",
    memoryClear: "Forget everything",
    instructionsTitle: "Global instructions",
    instructionsBody: "Customize the instructions given to Redrob for browser automation tasks.",
    instructionsPlaceholder: "Always prefer keyboard navigation over clicking.",
    instructionsSave: "Save instructions",
    modelTitle: "Model",
    modelBody: "Choose the model Redrob uses for new messages.",
    permissionModeTitle: "Asking before acting",
    permissionModeBody: "Reads never interrupt. Choose what happens when Redrob wants to change a page.",
    permissionModeAsk: "Ask before acting",
    permissionAskBody: "Redrob asks before it changes anything on a page.",
    permissionAutoBody: "Redrob works without pausing for approval.",
    togglePermissionMode: "Toggle permission mode",
    permissionModeAuto: "Act without asking",
    navAccount: "Account",
    navPermissions: "Permissions",
    navShortcuts: "Shortcuts",
    navOptions: "Options",
    keyboardShortcutTitle: "Keyboard shortcut",
    keyboardShortcutBody: "Configure the keyboard shortcut used to open Redrob in Browser.",
    openSidePanel: "Open side panel",
    currentShortcut: "Current shortcut",
    noShortcut: "No shortcut configured",
    configure: "Configure",
    permissionsTitle: "Permissions",
    permissionsBody: "Control the browser capabilities Redrob can use.",
    notificationsTitle: "Notifications",
    notificationsBody: "Show a notification when an agent task finishes.",
    notificationsBlocked: "Chrome is blocking notifications for this extension. Allow them in Chrome settings first.",
    microphoneTitle: "Microphone",
    microphoneBody: "Allow voice input in the side panel.",
    appearanceTitle: "Appearance",
    appearanceBody: "Choose how Redrob looks in this browser.",
    appearanceLabels: { system: "System", light: "Light", dark: "Dark" },
    languageTitle: "Language",
    languageBody: "Choose your preferred language for the extension interface.",
    shortcutsTitle: "Shortcuts",
    shortcutsBody: "Save prompts you reuse, then run one by typing / in the chat.",
    shortcutsEmpty: "Create your first shortcut to get started.",
    shortcutName: "Name",
    shortcutNamePlaceholder: "summarize",
    shortcutPrompt: "Prompt",
    shortcutPromptPlaceholder: "Summarize this page in five bullet points.",
    shortcutCreate: "Create shortcut",
    shortcutSave: "Save shortcut",
    shortcutEdit: "Edit",
    shortcutDelete: "Delete",
    keyNoticeTitle: "Add an API key to start working",
    keyNoticeAction: "Add key",
    connectTitle: "Connect Redrob",
    connectBody: "Add a Redrob API key to use the browser agent.",
    connect: "Connect",
    connected: "Connected.",
    connectPrimary: "Connect to Redrob",
    connectStarting: "Starting the connection...",
    connectEnterCode: "In the tab that opened, enter this code to approve:",
    connectWaiting: "Waiting for you to approve in the browser tab.",
    connectUnreachable: "Cannot reach the Console right now. Still trying, leave this open.",
    connectDenied: "The request was refused. You can try again.",
    connectExpired: "The code expired. Start the connection again.",
    connectFailed: "The connection could not be completed. Try again.",
    connectConnected: "Connected. This browser now has a key.",
    connectCancel: "Cancel",
    connectRetry: "Try again",
    connectPasteInstead: "Paste a key instead",
    emptyTitle: "Ask Redrob to work in your browser.",
    emptyBody: "Redrob reads the page, clicks and types for you, and pulls answers out of your open tabs.",
    composerPlaceholder: "Message Redrob",
    composerHint: "Enter to send · Shift+Enter for a new line",
    sendMessage: "Send message",
    stopGenerating: "Stop generating",
    stopAgent: "Stop Redrob",
    newChat: "New chat",
    settings: "Settings",
    thinking: "Thinking",
    stopped: "Stopped.",
    iterationLimit: "Stopped after the maximum number of steps.",
    engineRunning: "Running this turn on the Redrob Code engine.",
    engineNoBrowserTools: "The Redrob Code engine runs its own tools on the machine hosting it, so the browser tools were not available for this turn.",
    engineUnreachable: (message) => `Could not reach the Redrob Code engine: ${message}`,
    engineRequired: "The local Redrob Code engine is required for chat and is not reachable. Install Redrob Code, start it with 'redrob serve', or install the Redrob native host that starts it for you, then try again.",
    iterationLimitPrompt: "You have used all available tool steps. Answer now with what you have, and say plainly what is still unfinished.",
    rawResult: "Raw result",
    hideRawResult: "Hide raw result",
    stepsFailed: "failed",
    workedInBrowser: "Worked in the browser",
    stepCount: (count) => `${count} ${count === 1 ? "step" : "steps"}`,
    // A denied step is not a failure of the tool. AgentAction has no denied state,
    // so it takes the error ground and this label keeps the two apart.
    toolStatusLabels: {
      running: "Running",
      done: "Done",
      error: "Failed",
      denied: "Not allowed"
    },
    stepFailures: (count) => `${count} ${count === 1 ? "step" : "steps"} did not run`,
    allowActionSuffix: "?",
    allowActionBody: (toolName) => `Redrob wants to run ${toolName} on this page.`,
    deny: "Deny",
    alwaysAllow: "Always allow",
    allow: "Allow",
    toolLabels: {
      tabs_context: "Listing tabs",
      tabs_create: "Opening a tab",
      tabs_close: "Closing tabs",
      navigate: "Navigating",
      read_page: "Reading the page",
      get_page_text: "Reading page text",
      find: "Searching the page",
      form_input: "Filling a field",
      javascript_tool: "Running JavaScript",
      read_console_messages: "Reading the console",
      read_network_requests: "Reading network activity",
      resize_window: "Resizing the window",
      gif_creator: "Recording a GIF",
      upload_image: "Attaching an image",
      browser_batch: "Running browser actions",
      memory_write: "Remembering something",
      memory_search: "Searching memory",
      memory_delete: "Forgetting something"
    },
    computerLabels: {
      left_click: "Clicking",
      right_click: "Right-clicking",
      double_click: "Double-clicking",
      triple_click: "Selecting text",
      left_click_drag: "Dragging",
      hover: "Hovering",
      type: "Typing",
      key: "Pressing a key",
      screenshot: "Taking a screenshot",
      scroll: "Scrolling",
      scroll_to: "Scrolling to an element",
      zoom: "Zooming in",
      wait: "Waiting"
    },
    usingThePage: "Using the page",
    runningTool: (toolName) => `Running ${toolName}`,
    navigatingTo: (url) => `Navigating to ${url}`,
    searchingFor: (query) => `Searching for “${query}”`,
    uploadImage: "Upload image",
    removeAttachment: "Remove attachment",
    uploadTypeError: "File type not supported. Please upload an image (PNG, JPG, GIF, or WebP).",
    uploadFailed: "Upload failed.",
    startRecording: "Start recording",
    stopRecording: "Stop recording and save GIF",
    recordingHint: "Recording — Redrob's actions are being captured as a GIF.",
    recordingFailed: "Recording could not be started.",
    // A-5: what the agent can already act in. One entry per group in
    // src/chat/capabilities.js, which refuses to load if the two drift apart.
    capabilityTitle: "What it can do in this browser",
    tryPrompt: "Try this",
    capabilityReadNote: "Looks only. These never change anything.",
    capabilityWriteNote: "Acts. Each one asks you first.",
    capabilityLabels: {
      reading: "Read the page and your tabs",
      inspecting: "Read the console and network",
      capturing: "Record the screen",
      browsing: "Open, close and go to pages",
      acting: "Fill in forms and click",
      running: "Run code on a page",
      window: "Resize the window and send files"
    },
    capabilityPrompts: {
      reading: "What does this page say about pricing?",
      inspecting: "Any errors in the console on this page?",
      capturing: "Record a short clip of this page scrolling.",
      browsing: "Open the three links in this list, each in its own tab.",
      acting: "Fill this form with my details and stop before submitting.",
      running: "Count every image on this page that has no alt text.",
      window: "Make the window phone-sized and show me what breaks."
    },
    starterPrompts: [
      {
        title: "Summarize this page",
        prompt: "Summarize the page in the current tab. Key points only, in a short list."
      },
      {
        title: "Pull it into a table",
        prompt: "Collect the key information on this page into a table I can copy."
      },
      {
        title: "Compare my open tabs",
        prompt: "Compare the pages in my open tabs and tell me how they differ."
      },
      {
        title: "Fill out this form",
        prompt: "Fill out the form on this page with realistic sample values, but do not submit it."
      }
    ]
  },
  "ko-KR": {
    locale: "ko-KR",
    getKey: "API 키 발급받기",
    apiKeyLabel: "API 키",
    apiKeyPlaceholder: "예: rrk_a1b2c3d4e5f6",
    settingsTitle: "API 키",
    settingsBody: "이 브라우저에서 레드롭이 사용하는 키를 변경하세요.",
    settingsHint: "이미 저장된 키가 있습니다. 새 키를 입력하면 교체됩니다.",
    accountTitle: "계정",
    accountBody: "이 브라우저에 연결된 API 키를 관리합니다.",
    apiKeyHelp: "레드롭 콘솔에서 발급받은 API 키를 붙여 넣으세요.",
    savedKeyLabel: "저장된 키",
    keyConnected: "연결됨",
    keyNotConfigured: "미설정",
    deleteKey: "키 삭제",
    dangerTitle: "API 키 삭제",
    dangerBody: "키를 삭제하면 새 키를 저장하기 전까지 채팅을 사용할 수 없습니다.",
    deleteTitle: "이 API 키를 삭제할까요?",
    deleteBody: "다른 키를 추가하기 전까지 이 브라우저에서 레드롭을 사용할 수 없습니다.",
    deleteConfirm: "키 삭제",
    cancel: "취소",
    deleted: "API 키를 삭제했습니다.",
    permissionGranted: "허용됨",
    permissionBlocked: "차단됨",
    permissionNotRequested: "미요청",
    saveKey: "API 키 저장",
    checking: "확인 중...",
    keyRejected: "이 키는 거부됐어요. 다시 확인해 주세요.",
    keyUnreachable: "레드롭에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    saving: "저장 중...",
    saved: "저장되었습니다. 다음 대화부터 이 키를 사용합니다.",
    onboardingTitle: "이제 레드롭이 브라우저를 제어할 수 있습니다",
    onboardingBody: "브라우저에서 사용자를 대신해 작업합니다.",
    onboardingRiskInjection: "페이지에 숨은 지침이 에이전트를 속일 수 있어요.",
    onboardingRiskPrivacy: "열린 탭을 읽고 스크린샷을 찍습니다.",
    onboardingRiskOversight: "하는 일을 지켜보고, 이상하면 멈춰 주세요.",
    onboardingAccept: "이해했습니다",
    allowOnce: "이번만 허용",
    allowSite: (host) => `${host}에서 항상 허용`,
    approvedSitesTitle: "허용한 사이트",
    approvedSitesBody: "이 사이트에서는 묻지 않고 실행합니다. 나머지는 계속 확인합니다.",
    approvedSitesEmpty: "아직 허용한 사이트가 없습니다.",
    revokeSite: "해제",
    moreOptions: "더 많은 옵션",
    exportConversation: "대화 내보내기",
    copyMessage: "메시지 복사",
    copied: "복사됨",
    memoryTitle: "기억",
    memoryBody: "레드롭이 기억하고 있는 내용입니다. 이 컴퓨터에만 저장되고, 요청을 보낼 때 함께 전달됩니다.",
    memoryEmpty: "아직 기억한 내용이 없습니다.",
    memoryClear: "전부 지우기",
    instructionsTitle: "전역 지침",
    instructionsBody: "브라우저 자동화 작업에서 레드롭이 따를 지침을 직접 정합니다.",
    instructionsPlaceholder: "가능하면 클릭보다 키보드 이동을 쓰세요.",
    instructionsSave: "지침 저장",
    modelTitle: "모델",
    modelBody: "새 메시지에 사용할 모델을 고르세요.",
    permissionModeTitle: "실행 전 확인",
    permissionModeBody: "읽기 작업은 묻지 않습니다. 페이지를 바꾸려 할 때 어떻게 할지 고르세요.",
    permissionModeAsk: "실행 전 확인",
    permissionAskBody: "페이지를 바꾸기 전에 레드롭이 먼저 확인합니다.",
    permissionAutoBody: "레드롭이 승인 대기 없이 작업합니다.",
    togglePermissionMode: "권한 모드 전환",
    permissionModeAuto: "묻지 않고 실행",
    navAccount: "계정",
    navPermissions: "권한",
    navShortcuts: "단축어",
    navOptions: "옵션",
    keyboardShortcutTitle: "키보드 단축키",
    keyboardShortcutBody: "브라우저용 레드롭을 여는 키보드 단축키를 설정합니다.",
    openSidePanel: "사이드 패널 열기",
    currentShortcut: "현재 단축키",
    noShortcut: "설정된 단축키가 없습니다",
    configure: "설정",
    permissionsTitle: "권한",
    permissionsBody: "레드롭이 사용할 수 있는 브라우저 기능을 관리합니다.",
    notificationsTitle: "알림",
    notificationsBody: "에이전트 작업이 끝나면 알림을 표시합니다.",
    notificationsBlocked: "크롬이 이 확장 프로그램의 알림을 차단하고 있습니다. 크롬 설정에서 먼저 허용해 주세요.",
    microphoneTitle: "마이크",
    microphoneBody: "사이드패널에서 음성 입력을 허용합니다.",
    appearanceTitle: "화면 모드",
    appearanceBody: "이 브라우저에서 레드롭을 어떻게 보여줄지 고르세요.",
    appearanceLabels: { system: "시스템", light: "라이트", dark: "다크" },
    languageTitle: "언어",
    languageBody: "확장 프로그램 인터페이스에 사용할 언어를 선택하세요.",
    shortcutsTitle: "단축어",
    shortcutsBody: "자주 쓰는 프롬프트를 저장해 두고, 대화에서 /를 입력해 바로 부르세요.",
    shortcutsEmpty: "첫 단축어를 만들어 보세요.",
    shortcutName: "이름",
    shortcutNamePlaceholder: "요약",
    shortcutPrompt: "프롬프트",
    shortcutPromptPlaceholder: "이 페이지를 다섯 줄로 요약해 주세요.",
    shortcutCreate: "단축어 만들기",
    shortcutSave: "저장",
    shortcutEdit: "수정",
    shortcutDelete: "삭제",
    keyNoticeTitle: "작업을 시작하려면 API 키를 입력하세요",
    keyNoticeAction: "키 입력",
    connectTitle: "레드롭 연결",
    connectBody: "브라우저 에이전트를 사용하려면 레드롭 API 키를 입력하세요.",
    connect: "연결",
    connected: "연결되었습니다.",
    connectPrimary: "레드롭에 연결",
    connectStarting: "연결을 시작하는 중입니다...",
    connectEnterCode: "열린 탭에서 이 코드를 입력해 승인하세요:",
    connectWaiting: "브라우저 탭에서 승인하기를 기다리는 중입니다.",
    connectUnreachable: "지금 콘솔에 연결할 수 없습니다. 계속 시도 중이니 이 화면을 열어 두세요.",
    connectDenied: "요청이 거부되었습니다. 다시 시도할 수 있습니다.",
    connectExpired: "코드가 만료되었습니다. 연결을 다시 시작하세요.",
    connectFailed: "연결을 완료하지 못했습니다. 다시 시도하세요.",
    connectConnected: "연결되었습니다. 이제 이 브라우저에 키가 있습니다.",
    connectCancel: "취소",
    connectRetry: "다시 시도",
    connectPasteInstead: "대신 키 붙여넣기",
    emptyTitle: "브라우저 작업을 레드롭에게 맡겨보세요.",
    emptyBody: "페이지를 읽고, 대신 클릭하고 입력하고, 열려 있는 탭에서 필요한 답을 찾아옵니다.",
    composerPlaceholder: "레드롭에게 메시지",
    composerHint: "Enter로 전송 · Shift+Enter로 줄바꿈",
    sendMessage: "메시지 보내기",
    stopGenerating: "생성 중지",
    stopAgent: "레드롭 중지",
    newChat: "새 대화",
    settings: "설정",
    thinking: "생각하는 중",
    stopped: "중지했습니다.",
    iterationLimit: "최대 단계 수에 도달해 중단했습니다.",
    engineRunning: "이번 턴은 레드롭 코드 엔진에서 실행합니다.",
    engineNoBrowserTools: "레드롭 코드 엔진은 엔진이 실행되는 컴퓨터에서 자체 도구를 사용하므로, 이번 턴에서는 브라우저 도구를 쓸 수 없었습니다.",
    engineUnreachable: (message) => `레드롭 코드 엔진에 연결할 수 없습니다: ${message}`,
    engineRequired: "채팅에는 로컬 레드롭 코드 엔진이 필요하지만 연결할 수 없습니다. 레드롭 코드를 설치한 뒤 'redrob serve'로 실행하거나, 엔진을 대신 실행해 주는 레드롭 네이티브 호스트를 설치한 다음 다시 시도하세요.",
    iterationLimitPrompt: "사용할 수 있는 도구 단계를 모두 소진했습니다. 지금까지 확인한 내용으로 답하고, 아직 끝내지 못한 부분을 분명히 알려 주세요.",
    rawResult: "원본 결과",
    hideRawResult: "원본 결과 숨기기",
    stepsFailed: "실패",
    workedInBrowser: "브라우저에서 작업함",
    stepCount: (count) => `${count}단계`,
    toolStatusLabels: {
      running: "실행 중",
      done: "완료",
      error: "실패",
      denied: "허용하지 않음"
    },
    stepFailures: (count) => `${count}단계가 실행되지 않음`,
    allowActionSuffix: "할까요?",
    allowActionBody: (toolName) => `레드롭이 이 페이지에서 ${toolName}을(를) 실행하려고 합니다.`,
    deny: "거부",
    alwaysAllow: "항상 허용",
    allow: "허용",
    toolLabels: {
      tabs_context: "탭 목록 확인",
      tabs_create: "새 탭 열기",
      tabs_close: "탭 닫기",
      navigate: "페이지 이동",
      read_page: "페이지 읽기",
      get_page_text: "페이지 텍스트 읽기",
      find: "페이지에서 찾기",
      form_input: "입력란 채우기",
      javascript_tool: "JavaScript 실행",
      read_console_messages: "콘솔 읽기",
      read_network_requests: "네트워크 기록 읽기",
      resize_window: "창 크기 조절",
      gif_creator: "GIF 녹화",
      upload_image: "이미지 첨부",
      browser_batch: "브라우저 작업 실행",
      memory_write: "기억하는 중",
      memory_search: "기억 검색",
      memory_delete: "기억 삭제"
    },
    computerLabels: {
      left_click: "클릭",
      right_click: "우클릭",
      double_click: "더블클릭",
      triple_click: "텍스트 선택",
      left_click_drag: "드래그",
      hover: "마우스 올리기",
      type: "입력",
      key: "키 입력",
      screenshot: "스크린샷 촬영",
      scroll: "스크롤",
      scroll_to: "요소로 스크롤",
      zoom: "확대",
      wait: "대기"
    },
    usingThePage: "페이지 조작",
    runningTool: (toolName) => `${toolName} 실행`,
    navigatingTo: (url) => `${url}로 이동`,
    searchingFor: (query) => `“${query}” 검색`,
    uploadImage: "이미지 업로드",
    removeAttachment: "첨부 제거",
    uploadTypeError: "지원하지 않는 파일 형식입니다. 이미지(PNG, JPG, GIF, WebP)를 올려주세요.",
    uploadFailed: "업로드하지 못했습니다.",
    startRecording: "녹화 시작",
    stopRecording: "녹화 종료하고 GIF 저장",
    recordingHint: "녹화 중 — 레드롭의 동작을 GIF로 담고 있습니다.",
    recordingFailed: "녹화를 시작하지 못했습니다.",
    capabilityTitle: "이 브라우저에서 할 수 있는 일",
    tryPrompt: "이걸 시켜보기",
    capabilityReadNote: "보기만 합니다. 아무것도 바꾸지 않습니다.",
    capabilityWriteNote: "실제로 행동합니다. 할 때마다 먼저 묻습니다.",
    capabilityLabels: {
      reading: "페이지와 탭 읽기",
      inspecting: "콘솔과 네트워크 읽기",
      capturing: "화면 녹화",
      browsing: "페이지 열기, 닫기, 이동",
      acting: "양식 채우기와 클릭",
      running: "페이지에서 코드 실행",
      window: "창 크기 바꾸기와 파일 보내기"
    },
    capabilityPrompts: {
      reading: "이 페이지에서 가격에 대해 뭐라고 하나요?",
      inspecting: "이 페이지 콘솔에 오류가 있나요?",
      capturing: "이 페이지를 스크롤하는 짧은 영상으로 담아 주세요.",
      browsing: "이 목록의 링크 세 개를 각각 새 탭으로 열어 주세요.",
      acting: "이 양식을 내 정보로 채우고 제출 전에 멈춰 주세요.",
      running: "이 페이지에서 대체 텍스트가 없는 이미지를 모두 세어 주세요.",
      window: "창을 휴대폰 크기로 만들고 무엇이 깨지는지 보여 주세요."
    },
    starterPrompts: [
      {
        title: "이 페이지 요약",
        prompt: "지금 보고 있는 탭의 내용을 핵심만 짧게 정리해 주세요."
      },
      {
        title: "표로 정리",
        prompt: "이 페이지의 주요 정보를 복사해서 쓸 수 있게 표로 정리해 주세요."
      },
      {
        title: "열린 탭 비교",
        prompt: "열려 있는 탭들의 내용을 비교해서 차이를 알려주세요."
      },
      {
        title: "폼 채우기",
        prompt: "이 페이지의 입력 폼을 그럴듯한 예시 값으로 채워 주세요. 제출은 하지 마세요."
      }
    ]
  }
};
function firstPartyCopy(locale) {
  return COPY[locale] || COPY["en-US"];
}

// src/i18n/add-locales.js
var SUPPORTED_LOCALES = ["en-US", "ko-KR"];
var LOCALE_LABELS = {
  "en-US": "English",
  "ko-KR": "한국어"
};

// src/i18n/preferred-locale.js
function isKoreanLocale(locale) {
  return String(locale || "").toLowerCase().startsWith("ko");
}
async function resolveUiLocale() {
  const chromeApi = globalThis.chrome;
  if (!chromeApi?.storage?.local) {
    return navigatorLanguageToLocale();
  }
  const stored = await chromeApi.storage.local.get("preferred_locale");
  const preferred = stored.preferred_locale;
  if (SUPPORTED_LOCALES.includes(preferred)) {
    return preferred;
  }
  const fallback = navigatorLanguageToLocale();
  if (preferred) {
    await chromeApi.storage.local.set({ preferred_locale: fallback });
  }
  return fallback;
}
function navigatorLanguageToLocale() {
  return isKoreanLocale(globalThis.navigator?.language) ? "ko-KR" : "en-US";
}

// src/i18n/use-ui-copy.js
function useUiCopy(React22) {
  const [copy, setCopy] = React22.useState(() => firstPartyCopy(defaultLocale()));
  React22.useEffect(() => {
    let active = true;
    const load = () => resolveUiLocale().then((locale) => {
      if (active) setCopy(firstPartyCopy(locale));
    });
    void load();
    const onChanged = (changes, areaName) => {
      if (areaName === "local" && changes.preferred_locale) void load();
    };
    globalThis.chrome?.storage?.onChanged?.addListener?.(onChanged);
    return () => {
      active = false;
      globalThis.chrome?.storage?.onChanged?.removeListener?.(onChanged);
    };
  }, []);
  return copy;
}
function defaultLocale() {
  return String(globalThis.navigator?.language ?? "").toLowerCase().startsWith("ko") ? "ko-KR" : "en-US";
}

// src/ui/appearance.js
var APPEARANCE_STORAGE_KEY = "redrobAppearance";
var APPEARANCE_MODES = ["system", "light", "dark"];
function storageArea() {
  return globalThis.chrome?.storage?.local;
}
function isAppearanceMode(value) {
  return APPEARANCE_MODES.includes(value);
}
async function readAppearance() {
  try {
    const stored = await storageArea()?.get(APPEARANCE_STORAGE_KEY);
    const value = stored?.[APPEARANCE_STORAGE_KEY];
    return isAppearanceMode(value) ? value : "system";
  } catch {
    return "system";
  }
}
async function writeAppearance(mode) {
  if (!isAppearanceMode(mode)) return;
  try {
    await storageArea()?.set({ [APPEARANCE_STORAGE_KEY]: mode });
  } catch {
  }
}
function resolveMode(appearance, prefersDark) {
  if (appearance === "dark") return "dark";
  if (appearance === "light") return "light";
  return prefersDark ? "dark" : "light";
}
function installAppearance(documentRef = globalThis.document) {
  const colorScheme = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  let appearance = "system";
  const apply = () => {
    const mode = resolveMode(appearance, Boolean(colorScheme?.matches));
    documentRef?.documentElement?.setAttribute("data-mode", mode);
    documentRef?.body?.setAttribute("data-theme", mode);
  };
  apply();
  void readAppearance().then((stored) => {
    appearance = stored;
    apply();
  });
  colorScheme?.addEventListener?.("change", apply);
  const onStorageChanged = (changes, areaName) => {
    if (areaName !== "local" || !changes[APPEARANCE_STORAGE_KEY]) return;
    const next = changes[APPEARANCE_STORAGE_KEY].newValue;
    appearance = isAppearanceMode(next) ? next : "system";
    apply();
  };
  globalThis.chrome?.storage?.onChanged?.addListener?.(onStorageChanged);
  return () => {
    colorScheme?.removeEventListener?.("change", apply);
    globalThis.chrome?.storage?.onChanged?.removeListener?.(onStorageChanged);
  };
}

// src/ui/initialize-sidepanel.js
function initializeSidepanelTabContext() {
  if (!globalThis.window || location.pathname !== "/sidepanel.html" || location.search) {
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (!tab?.id) return;
    const url = new URL(location.href);
    url.searchParams.set("tabId", String(tab.id));
    history.replaceState(null, "", url.href);
  });
}

// src/chat/auth-state.js
function useApiKeyState(deps) {
  const {
    React: React22,
    getLocalStorageItem,
    storageKeys,
    chrome: chromeApi = globalThis.chrome
  } = deps;
  const { useState: useState15, useCallback: useCallback3, useEffect: useEffect11 } = React22;
  const [isLoading, setIsLoading] = useState15(true);
  const [apiKey, setApiKey] = useState15(void 0);
  const reloadApiKey = useCallback3(async () => {
    setIsLoading(true);
    const storedApiKey = await getLocalStorageItem(storageKeys.REDROB_API_KEY) || void 0;
    setApiKey(storedApiKey);
    setIsLoading(false);
  }, [getLocalStorageItem, storageKeys]);
  useEffect11(() => {
    reloadApiKey();
    const onStorageChanged = (changes, areaName) => {
      if (areaName !== "local") return;
      if (storageKeys.REDROB_API_KEY in changes) {
        reloadApiKey();
      }
    };
    chromeApi.storage.onChanged.addListener(onStorageChanged);
    return () => {
      chromeApi.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [reloadApiKey, storageKeys, chromeApi]);
  return {
    apiKey,
    needsApiKey: !apiKey,
    isLoading,
    reloadApiKey
  };
}

// src/chat/agent-preferences.js
var INSTRUCTIONS_STORAGE_KEY = "redrobGlobalInstructions";
var MODEL_STORAGE_KEY = "redrobModel";
var MAX_INSTRUCTIONS_LENGTH = 2e3;
function storageArea2() {
  return globalThis.chrome?.storage?.local;
}
async function readGlobalInstructions() {
  try {
    const stored = await storageArea2()?.get(INSTRUCTIONS_STORAGE_KEY);
    return String(stored?.[INSTRUCTIONS_STORAGE_KEY] ?? "").slice(
      0,
      MAX_INSTRUCTIONS_LENGTH
    );
  } catch {
    return "";
  }
}
async function readSelectedModel() {
  try {
    const stored = await storageArea2()?.get(MODEL_STORAGE_KEY);
    return stored?.[MODEL_STORAGE_KEY] || REDROB_DEFAULT_MODEL;
  } catch {
    return REDROB_DEFAULT_MODEL;
  }
}

// src/chat/browser-tools.js
var MAX_CHARS = {
  type: "number",
  description: "Truncate the output at this many characters."
};
var TAB_ID = {
  type: "number",
  description: "Target tab id. Defaults to the tab the side panel is driving."
};
var REF = {
  type: "string",
  description: "Element ref_id from the most recent read_page or find result. Refs go stale when the page changes; re-read the page instead of reusing an old one, and never invent a name such as 'viewport'."
};
var COORDINATE = {
  type: "array",
  items: { type: "number" },
  minItems: 2,
  maxItems: 2,
  description: "Viewport [x, y] pixel coordinate."
};
var BROWSER_TOOLS = [
  {
    name: "tabs_context",
    description: "List the browser tabs available to the agent, including their ids, titles, and URLs.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "tabs_create",
    description: "Open a new browser tab.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open." },
        active: {
          type: "boolean",
          description: "Focus the new tab. Defaults to true."
        },
        grouped: {
          type: "boolean",
          description: "Add the tab to the agent's tab group."
        }
      }
    }
  },
  {
    name: "tabs_close",
    description: "Close one or more browser tabs.",
    input_schema: {
      type: "object",
      properties: {
        tabIds: {
          type: "array",
          items: { type: "number" },
          description: "Tab ids to close."
        },
        tabId: TAB_ID
      }
    }
  },
  {
    name: "navigate",
    description: "Navigate a tab to a URL.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" }, tabId: TAB_ID },
      required: ["url"]
    }
  },
  {
    name: "read_page",
    description: "Read the page as an accessibility tree. Returns ref_id handles that click, type, and form_input accept.",
    input_schema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["all", "interactive"],
          description: "Limit the tree to interactive elements."
        },
        max_chars: MAX_CHARS,
        depth: { type: "number", description: "Maximum tree depth." },
        ref_id: {
          type: "string",
          description: "Read the subtree rooted at this element."
        },
        tabId: TAB_ID
      }
    }
  },
  {
    name: "get_page_text",
    description: "Read the page as plain readable text. Prefer this over read_page for articles and long prose.",
    input_schema: {
      type: "object",
      properties: { max_chars: MAX_CHARS, tabId: TAB_ID }
    }
  },
  {
    name: "find",
    description: "Find elements on the page whose text, label, placeholder, or title contains a query.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for." },
        tabId: TAB_ID
      },
      required: ["query"]
    }
  },
  {
    name: "form_input",
    description: "Set the value of an input, textarea, or select, firing the input and change events the page listens for.",
    input_schema: {
      type: "object",
      properties: {
        ref: REF,
        value: { type: "string", description: "Value to set." },
        tabId: TAB_ID
      },
      required: ["ref", "value"]
    }
  },
  {
    name: "computer",
    description: "Drive the page with mouse and keyboard, take screenshots, and scroll. Pass ref for element targets or coordinate for raw points.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "screenshot, zoom, type, key, and wait act on the whole page and take no target.",
          enum: [
            "left_click",
            "right_click",
            "double_click",
            "triple_click",
            "left_click_drag",
            "hover",
            "type",
            "key",
            "screenshot",
            "scroll",
            "scroll_to",
            "zoom",
            "wait"
          ]
        },
        coordinate: COORDINATE,
        start_coordinate: {
          ...COORDINATE,
          description: "Drag origin for left_click_drag."
        },
        region: {
          type: "array",
          items: { type: "number" },
          minItems: 4,
          maxItems: 4,
          description: "Zoom region [x0, y0, x1, y1]."
        },
        ref: REF,
        text: {
          type: "string",
          description: "Text to type, or the key name for the key action."
        },
        duration: { type: "number", description: "Seconds to wait." },
        scroll_direction: {
          type: "string",
          enum: ["up", "down", "left", "right"]
        },
        scroll_amount: { type: "number", minimum: 1, maximum: 10 },
        tabId: TAB_ID
      },
      required: ["action"]
    }
  },
  {
    name: "javascript_tool",
    description: "Evaluate a JavaScript expression in the page and return its value. Use it when no other tool fits.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Expression to evaluate." },
        tabId: TAB_ID
      },
      required: ["text"]
    }
  },
  {
    name: "read_console_messages",
    description: "Read console output captured from the page.",
    input_schema: {
      type: "object",
      properties: {
        onlyErrors: { type: "boolean" },
        pattern: {
          type: "string",
          description: "Case-insensitive regular expression filter."
        },
        tabId: TAB_ID
      }
    }
  },
  {
    name: "read_network_requests",
    description: "Read network requests captured from the page.",
    input_schema: {
      type: "object",
      properties: {
        urlPattern: {
          type: "string",
          description: "Case-insensitive regular expression on the URL."
        },
        tabId: TAB_ID
      }
    }
  },
  {
    name: "resize_window",
    description: "Resize the browser window holding a tab.",
    input_schema: {
      type: "object",
      properties: {
        width: { type: "number" },
        height: { type: "number" },
        tabId: TAB_ID
      },
      required: ["width", "height"]
    }
  },
  {
    name: "gif_creator",
    description: "Record the agent's own actions as an animated GIF. Start recording, act, then export.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["start_recording", "stop_recording", "export", "clear"]
        },
        filename: { type: "string" },
        download: {
          type: "boolean",
          description: "Download the exported GIF."
        },
        coordinate: {
          ...COORDINATE,
          description: "Drop the exported GIF onto this point instead."
        },
        tabId: TAB_ID
      },
      required: ["action"]
    }
  },
  {
    name: "upload_image",
    description: "Attach a previously captured image (from a screenshot or GIF export) to a file input or drop target.",
    input_schema: {
      type: "object",
      properties: {
        imageId: {
          type: "string",
          description: "imageId returned by computer or gif_creator."
        },
        ref: REF,
        coordinate: COORDINATE,
        filename: { type: "string" },
        tabId: TAB_ID
      },
      required: ["imageId"]
    }
  },
  {
    name: "browser_batch",
    description: "Run several browser tools in one round trip. Stops at the first failure.",
    input_schema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          description: "Ordered tool calls to run.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Tool name. browser_batch cannot nest."
              },
              input: { type: "object", description: "Arguments for the tool." }
            },
            required: ["name"]
          }
        }
      },
      required: ["actions"]
    }
  }
];
var WRITE_TOOLS = /* @__PURE__ */ new Set([
  "navigate",
  "computer",
  "form_input",
  "javascript_tool",
  "tabs_create",
  "tabs_close",
  "resize_window",
  "upload_image",
  "browser_batch"
]);
function describeToolCall(toolName, args = {}, copy) {
  if (!copy) return toolName;
  if (toolName === "computer") {
    return copy.computerLabels[args.action] ?? copy.usingThePage;
  }
  if (toolName === "navigate" && args.url) return copy.navigatingTo(args.url);
  if (toolName === "find" && args.query) return copy.searchingFor(args.query);
  return copy.toolLabels[toolName] ?? copy.runningTool(toolName);
}

// src/chat/chat-store.js
var EMPTY_STATE = {
  inputText: "",
  messages: [],
  isSending: false,
  pendingToolApproval: null
};
var state = { ...EMPTY_STATE };
var listeners = /* @__PURE__ */ new Set();
function emit() {
  for (const listener of listeners) listener();
}
function update(patch) {
  state = { ...state, ...patch };
  emit();
}
var redrobChatStore = {
  getState() {
    return {
      ...state,
      setInputText(inputText) {
        update({ inputText });
      },
      setMessages(messages) {
        update({ messages });
      },
      addMessage(message) {
        update({ messages: [...state.messages, message] });
      },
      updateMessage(id, patch) {
        update({
          messages: state.messages.map(
            (message) => message.id === id ? { ...message, ...patch } : message
          )
        });
      },
      setSending(isSending) {
        update({ isSending });
      },
      setPendingToolApproval(pendingToolApproval) {
        update({ pendingToolApproval });
      },
      reset() {
        state = { ...EMPTY_STATE };
        emit();
      }
    };
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};
globalThis.__redrobChatStore = redrobChatStore;
function useRedrobChatStore(React22) {
  return React22.useSyncExternalStore(
    redrobChatStore.subscribe,
    () => state,
    () => state
  );
}

// src/engine/redrob-code-session.js
var REDROB_DIRECTORY_HEADER = "x-redrob-directory";
var DEFAULT_ENGINE_MODEL = { providerID: "redrob", modelID: "auto" };
var RedrobCodeRequestError = class extends Error {
  constructor(operation, status, body) {
    super(
      `Redrob Code ${operation} failed with HTTP ${status}: ${String(body).slice(0, 500)}`
    );
    this.name = "RedrobCodeRequestError";
    this.status = status;
    this.body = body;
  }
};
function createRedrobCodeClient({
  baseUrl,
  directory,
  password,
  token,
  fetchImpl
} = {}) {
  if (!baseUrl) throw new Error("createRedrobCodeClient needs a baseUrl");
  if (!directory) throw new Error("createRedrobCodeClient needs a directory");
  const doFetch = fetchImpl ?? globalThis.fetch;
  const headers = {
    "content-type": "application/json",
    [REDROB_DIRECTORY_HEADER]: directory
  };
  const secret = token ?? password;
  if (secret) headers.authorization = `Basic ${btoa(`redrob:${secret}`)}`;
  const request = async (operation, path, init = {}) => {
    const response = await doFetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...init.headers ?? {} }
    });
    if (!response.ok) {
      throw new RedrobCodeRequestError(
        operation,
        response.status,
        await response.text()
      );
    }
    return response;
  };
  return {
    // Exposed so other engine clients (the provider routes, M-1/M-2) can carry the
    // SAME credential and directory header rather than rebuilding them. A second
    // place that assembles the Basic header is a second place that can get it wrong.
    request,
    async health() {
      const response = await doFetch(`${baseUrl}/global/health`, { headers });
      return response.json();
    },
    /**
     * Register an MCP server with the engine for this project directory. The
     * config is the V1 remote MCP shape; registering over HTTP keeps the user's
     * config file untouched. Tool names reach the model as `<name>_<tool>`.
     */
    async registerMcpServer({ name, url, headers: mcpHeaders } = {}) {
      await request("mcp.register", "/mcp", {
        method: "POST",
        body: JSON.stringify({
          name,
          config: {
            type: "remote",
            url,
            ...mcpHeaders ? { headers: mcpHeaders } : {}
          }
        })
      });
    },
    /** Current MCP server connection status, keyed by server name. */
    async mcpStatus() {
      const response = await request("mcp.status", "/mcp");
      return response.json();
    },
    async createSession({ title } = {}) {
      const response = await request("session.create", "/session", {
        method: "POST",
        body: JSON.stringify(title ? { title } : {})
      });
      return response.json();
    },
    /**
     * Send one message and resolve when the turn settles. The reply carries the
     * assistant message `info` (where `info.error` surfaces a failed turn) and
     * the resolved `parts`.
     */
    async sendMessage({ sessionId, text, model, agent, system }) {
      const response = await request(
        "session.message",
        `/session/${encodeURIComponent(sessionId)}/message`,
        {
          method: "POST",
          body: JSON.stringify({
            model: model ?? DEFAULT_ENGINE_MODEL,
            parts: [{ type: "text", text }],
            ...agent ? { agent } : {},
            ...system ? { system } : {}
          })
        }
      );
      return response.json();
    },
    async abort({ sessionId }) {
      await request(
        "session.abort",
        `/session/${encodeURIComponent(sessionId)}/abort`,
        { method: "POST" }
      );
    },
    async answerPermission({ sessionId, permissionId, response: answer }) {
      await request(
        "session.permission",
        `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`,
        { method: "POST", body: JSON.stringify({ response: answer }) }
      );
    },
    /**
     * The engine's live event bus. It is per instance, not per session, so a
     * caller filters by `sessionID`. The `directory` query addresses the project.
     */
    async *events({ signal }) {
      const query = `?directory=${encodeURIComponent(directory)}`;
      const response = await request("session.events", `/event${query}`, {
        headers: { accept: "text/event-stream" },
        ...signal ? { signal } : {}
      });
      if (!response.body) return;
      yield* readBusEvents(response.body);
    }
  };
}
async function* readBusEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const payload = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!payload || payload === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed.type !== "string") continue;
      yield { type: parsed.type, properties: parsed.properties ?? {} };
    }
  }
}
function eventSessionId(properties) {
  return properties.sessionID ?? properties.info?.sessionID ?? properties.part?.sessionID ?? properties.sessionId ?? void 0;
}
function textFromParts(parts) {
  if (!Array.isArray(parts)) return "";
  return parts.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("");
}
async function runRedrobCodeTurn({
  baseUrl,
  directory,
  prompt,
  sessionId,
  model,
  agent,
  system,
  password,
  token,
  fetchImpl,
  onEvent,
  onPermission,
  signal,
  timeoutMs = 3e5,
  title
}) {
  const client = createRedrobCodeClient({
    baseUrl,
    directory,
    password,
    token,
    fetchImpl
  });
  const activeSessionId = sessionId ?? (await client.createSession({ title: title ?? "Redrob Browser chat" })).id;
  const emit2 = (event) => {
    if (onEvent) onEvent(event);
  };
  const busController = new AbortController();
  const forwardAbort = () => busController.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => busController.abort(), timeoutMs);
  let streamedText = "";
  let toolCalls = 0;
  const busPump = (async () => {
    try {
      for await (const event of client.events({
        signal: busController.signal
      })) {
        if (eventSessionId(event.properties) !== activeSessionId) continue;
        if (event.type === "message.part.delta") {
          if (event.properties.field !== "text") continue;
          const delta = typeof event.properties.delta === "string" ? event.properties.delta : "";
          if (!delta) continue;
          streamedText += delta;
          emit2({ kind: "text", text: delta, accumulated: streamedText });
          continue;
        }
        if (event.type === "message.part.updated") {
          const part = event.properties.part ?? {};
          if (part.type !== "tool") continue;
          const status = part.state?.status;
          if (status === "running" || status === "pending") {
            if (status === "running") {
              toolCalls += 1;
              emit2({
                kind: "tool_start",
                id: part.callID ?? part.id,
                name: part.tool,
                args: part.state?.input ?? {}
              });
            }
            continue;
          }
          if (status === "completed" || status === "error") {
            const ok = status === "completed";
            emit2({
              kind: "tool_result",
              id: part.callID ?? part.id,
              ok,
              result: ok ? part.state?.output ?? part.state?.title ?? "" : part.state?.error ?? "tool failed"
            });
          }
          continue;
        }
        if (event.type === "permission.asked" || event.type === "permission.updated") {
          const permission = event.properties;
          emit2({
            kind: "permission",
            id: permission.id,
            permission: permission.permission,
            patterns: permission.patterns
          });
          if (onPermission) {
            const answer = await onPermission(permission);
            await client.answerPermission({
              sessionId: activeSessionId,
              permissionId: permission.id,
              response: answer ?? "reject"
            }).catch(() => void 0);
          }
          continue;
        }
        if (event.type === "session.idle") {
          const idleSession = event.properties.sessionID;
          if (idleSession === activeSessionId) break;
        }
      }
    } catch {
    }
  })();
  let text = "";
  let error = null;
  try {
    const reply = await client.sendMessage({
      sessionId: activeSessionId,
      text: prompt,
      model,
      agent,
      system
    });
    text = textFromParts(reply.parts) || streamedText;
    if (reply.info?.error) {
      const info = reply.info.error;
      error = {
        message: info.data?.message ?? info.name ?? "Redrob Code turn failed",
        code: info.name
      };
      emit2({ kind: "error", ...error });
    }
  } catch (thrown) {
    if (signal?.aborted) {
    } else {
      error = { message: thrown?.message ?? String(thrown) };
      throw thrown;
    }
  } finally {
    clearTimeout(timer);
    busController.abort();
    signal?.removeEventListener("abort", forwardAbort);
    await busPump;
  }
  if (signal?.aborted) {
    await client.abort({ sessionId: activeSessionId }).catch(() => void 0);
  }
  return { sessionId: activeSessionId, text, toolCalls, error };
}

// src/engine/engine-chat.js
var engineSessionId = null;
async function engineIsReachable(engine) {
  try {
    const health = await createRedrobCodeClient({
      baseUrl: engine.baseUrl,
      directory: engine.directory,
      token: engine.token
    }).health();
    return health?.healthy === true;
  } catch {
    return false;
  }
}
async function sendChatMessageViaEngine({ engine, text, copy, run }) {
  const store = redrobChatStore.getState();
  if (!await engineIsReachable(engine)) {
    store.addMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      text: copy.engineRequired,
      error: true
    });
    return { sessionId: engineSessionId, text: "", toolCalls: 0, error: true };
  }
  const assistantId = crypto.randomUUID();
  store.addMessage({
    id: assistantId,
    role: "assistant",
    text: "",
    streaming: true
  });
  const controller = new AbortController();
  if (run) run.stream = { controller };
  try {
    const result = await runRedrobCodeTurn({
      baseUrl: engine.baseUrl,
      directory: engine.directory,
      token: engine.token,
      prompt: text,
      sessionId: engineSessionId,
      signal: controller.signal,
      onEvent: (event) => {
        if (event.kind === "text") {
          redrobChatStore.getState().updateMessage(assistantId, {
            text: event.accumulated,
            streaming: true
          });
          return;
        }
        if (event.kind === "tool_start") {
          redrobChatStore.getState().addMessage({
            id: crypto.randomUUID(),
            role: "notice",
            text: `${event.name}(${JSON.stringify(event.args)})`
          });
        }
      }
    });
    engineSessionId = result.sessionId;
    redrobChatStore.getState().updateMessage(assistantId, {
      text: result.text || (result.error ? result.error.message : ""),
      streaming: false,
      ...result.error ? { error: true } : {}
    });
    return result;
  } catch (error) {
    redrobChatStore.getState().updateMessage(assistantId, {
      text: copy.engineUnreachable(error?.message ?? String(error)),
      streaming: false,
      error: true
    });
    return {
      sessionId: engineSessionId,
      text: "",
      toolCalls: 0,
      error
    };
  }
}

// src/engine/engine-location.js
var ENGINE_BASE_URL_KEY = "redrobEngineBaseUrl";
var ENGINE_DIRECTORY_KEY = "redrobEngineDirectory";
var ENGINE_TOKEN_KEY = "redrobEngineToken";
var DEFAULT_ENGINE_BASE_URL = "http://127.0.0.1:4096";
var DEFAULT_ENGINE_DIRECTORY = "~/.redrob/browser";
function storageArea3() {
  return globalThis.chrome?.storage?.local ?? null;
}
async function resolveEngineLocation() {
  let stored = null;
  try {
    stored = await storageArea3()?.get([
      ENGINE_BASE_URL_KEY,
      ENGINE_DIRECTORY_KEY,
      ENGINE_TOKEN_KEY
    ]);
  } catch {
    stored = null;
  }
  return normalizeEngineLocation(stored);
}
function normalizeEngineLocation(stored) {
  const baseUrl = usableBaseUrl(trimmed(stored?.[ENGINE_BASE_URL_KEY]));
  const directory = trimmed(stored?.[ENGINE_DIRECTORY_KEY]) ?? DEFAULT_ENGINE_DIRECTORY;
  const token = trimmed(stored?.[ENGINE_TOKEN_KEY]);
  return { baseUrl, directory, token };
}
function usableBaseUrl(value) {
  if (!value) return DEFAULT_ENGINE_BASE_URL;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return DEFAULT_ENGINE_BASE_URL;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return DEFAULT_ENGINE_BASE_URL;
  }
  return value.replace(/\/+$/, "");
}
function trimmed(value) {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next ? next : null;
}

// src/chat/permission-policy.js
var PERMISSION_MODE_KEY = "redrobPermissionMode";
var PERMISSION_MODES = ["ask", "auto"];
function storageArea4() {
  return globalThis.chrome?.storage?.local;
}
async function readPermissionMode() {
  try {
    const stored = await storageArea4()?.get(PERMISSION_MODE_KEY);
    const mode = stored?.[PERMISSION_MODE_KEY];
    return PERMISSION_MODES.includes(mode) ? mode : "ask";
  } catch {
    return "ask";
  }
}
async function writePermissionMode(mode) {
  if (!PERMISSION_MODES.includes(mode)) return;
  await storageArea4()?.set({ [PERMISSION_MODE_KEY]: mode });
}

// src/chat/tab-group-status.js
function setAgentTabGroupStatus(status) {
  return chrome.runtime.sendMessage({ type: "SET_AGENT_TAB_GROUP_STATUS", status }).catch(() => {
  });
}
var COMPLETION_PREFIX_MS = 4e3;
function setAgentActivity(active, unattended = false) {
  return chrome.runtime.sendMessage({ type: "SET_AGENT_ACTIVITY", active, unattended }).catch(() => {
  });
}

// src/chat/chat-agent.js
var REDROB_BROWSER_SYSTEM_PROMPT = [
  "You are Redrob, a browser agent working inside the user's Chrome browser.",
  "Use the browser tools to inspect and act on real pages instead of guessing.",
  "Prefer read_page to locate elements and reuse the ref_id values it returns.",
  "Use get_page_text for long prose and find to locate a control by its label.",
  "Take a screenshot when the visual layout matters to the answer.",
  "Work in small verified steps, then explain the result clearly."
].join(" ");
var activeRun = null;
var uiCopy = firstPartyCopy("en-US");
function setAgentCopy(copy) {
  if (copy) uiCopy = copy;
}
function stopChatMessage() {
  if (!activeRun) return;
  activeRun.cancelled = true;
  try {
    activeRun.stream?.controller?.abort?.();
  } catch {
  }
}
async function sendChatMessage(_apiKey, text) {
  const store = redrobChatStore.getState();
  await Promise.all([readGlobalInstructions(), readSelectedModel()]);
  const userMessage = { id: crypto.randomUUID(), role: "user", text };
  store.setMessages([...store.messages, userMessage]);
  store.setSending(true);
  const run = { cancelled: false, stream: null };
  activeRun = run;
  void setAgentTabGroupStatus("working");
  void readPermissionMode().then(
    (permissionMode) => setAgentActivity(true, permissionMode === "auto")
  );
  try {
    const engine = await resolveEngineLocation();
    await sendChatMessageViaEngine({ engine, text, copy: uiCopy, run });
  } finally {
    activeRun = null;
    clearStreamingFlags();
    redrobChatStore.getState().setSending(false);
    void setAgentActivity(false);
    void setAgentTabGroupStatus("done");
    setTimeout(() => void setAgentTabGroupStatus(null), COMPLETION_PREFIX_MS);
  }
}
function clearStreamingFlags() {
  const store = redrobChatStore.getState();
  store.setMessages(
    store.messages.map(
      (message) => message.streaming || message.status === "running" ? {
        ...message,
        streaming: false,
        status: message.status === "running" ? "done" : message.status
      } : message
    )
  );
}

// node_modules/@redrob-labs/ui/dist/esm/icons/index.js
var React = __toESM(require_react(), 1);
function svg(props, children) {
  return React.createElement("svg", Object.assign({ viewBox: "0 0 24 24", width: "1em", height: "1em", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "butt", strokeLinejoin: "miter", strokeMiterlimit: 3, "aria-hidden": "true", focusable: "false" }, props), children);
}
var h = React.createElement;
var icons = {
  filePlus: (p) => svg(p, [h("path", { d: "M5.5 3H14L18.5 7.5V19.5A1.5 1.5 0 0 1 17 21H7A1.5 1.5 0 0 1 5.5 19.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.5 18.5 7.5", key: "b" }), h("line", { x1: 12, y1: 11.8, x2: 12, y2: 17.8, key: "c" }), h("line", { x1: 9, y1: 14.8, x2: 15, y2: 14.8, key: "d" })]),
  code: (p) => svg(p, [h("polyline", { points: "9 7.8 4 12 9 16.2", key: "a" }), h("polyline", { points: "15 7.8 20 12 15 16.2", key: "b" })]),
  terminal: (p) => svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z", key: "a" }), h("polyline", { points: "7 9.9 10 12.42 7 14.93", key: "b" }), h("line", { x1: 12.5, y1: 14.93, x2: 17, y2: 14.93, key: "c" })]),
  database: (p) => svg(p, [h("ellipse", { cx: 12, cy: 6, rx: 7, ry: 3, key: "a" }), h("path", { d: "M5 6V18A7 3 0 0 0 19 18V6", key: "b" }), h("path", { d: "M5 12A7 3 0 0 0 19 12", key: "c" })]),
  server: (p) => svg(p, [h("path", { d: "M3 4H19A2 2 0 0 1 21 6V9A2 2 0 0 1 19 11H5A2 2 0 0 1 3 9Z", key: "a" }), h("path", { d: "M3 13H19A2 2 0 0 1 21 15V18A2 2 0 0 1 19 20H5A2 2 0 0 1 3 18Z", key: "b" }), h("rect", { x: 6, y: 6.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" }), h("rect", { x: 6, y: 15.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "d" }), h("line", { x1: 11, y1: 7.5, x2: 18, y2: 7.5, key: "e" }), h("line", { x1: 11, y1: 16.5, x2: 18, y2: 16.5, key: "f" })]),
  cloud: (p) => svg(p, h("path", { d: "M7.5 18.5H17A3.5 3.5 0 0 0 17 11.5A5.5 5.5 0 0 0 6.6 12.3A3.2 3.2 0 0 0 7.5 18.5Z", key: "a" })),
  cloudOff: (p) => svg(p, [h("path", { d: "M7.5 18.5H17A3.5 3.5 0 0 0 17 11.5A5.5 5.5 0 0 0 6.6 12.3A3.2 3.2 0 0 0 7.5 18.5Z", key: "a" }), h("line", { x1: 4.5, y1: 6.5, x2: 19.5, y2: 19.09, key: "b" })]),
  wifi: (p) => svg(p, [h("path", { d: "M4.34 13.07A10 10 0 0 1 19.66 13.07", key: "a" }), h("path", { d: "M7.1 15.39A6.4 6.4 0 0 1 16.9 15.39", key: "b" }), h("path", { d: "M9.85 17.7A2.8 2.8 0 0 1 14.15 17.7", key: "c" }), h("circle", { cx: 12, cy: 19.5, r: 1.4, fill: "currentColor", stroke: "none", key: "d" })]),
  wifiOff: (p) => svg(p, [h("path", { d: "M4.34 13.07A10 10 0 0 1 19.66 13.07", key: "a" }), h("path", { d: "M7.1 15.39A6.4 6.4 0 0 1 16.9 15.39", key: "b" }), h("path", { d: "M9.85 17.7A2.8 2.8 0 0 1 14.15 17.7", key: "c" }), h("circle", { cx: 12, cy: 19.5, r: 1.4, fill: "currentColor", stroke: "none", key: "d" }), h("line", { x1: 4.5, y1: 6.5, x2: 19.5, y2: 19.09, key: "e" })]),
  sync: (p) => svg(p, [h("path", { d: "M12 5.5A6.5 6.5 0 0 1 18.5 12", key: "a" }), h("polyline", { points: "16.57 9.7 18.5 12 20.43 9.7", key: "b" }), h("path", { d: "M12 18.5A6.5 6.5 0 0 1 5.5 12", key: "c" }), h("polyline", { points: "7.43 14.3 5.5 12 3.57 14.3", key: "d" })]),
  cpu: (p) => svg(p, [h("path", { d: "M6 6H16A2 2 0 0 1 18 8V16A2 2 0 0 1 16 18H8A2 2 0 0 1 6 16Z", key: "a" }), h("rect", { x: 9.5, y: 9.5, width: 5, height: 5, key: "b" }), h("line", { x1: 9.5, y1: 3, x2: 9.5, y2: 6, key: "c" }), h("line", { x1: 14.5, y1: 3, x2: 14.5, y2: 6, key: "d" }), h("line", { x1: 9.5, y1: 18, x2: 9.5, y2: 21, key: "e" }), h("line", { x1: 14.5, y1: 18, x2: 14.5, y2: 21, key: "f" }), h("line", { x1: 3, y1: 9.5, x2: 6, y2: 9.5, key: "g" }), h("line", { x1: 3, y1: 14.5, x2: 6, y2: 14.5, key: "h" }), h("line", { x1: 18, y1: 9.5, x2: 21, y2: 9.5, key: "i" }), h("line", { x1: 18, y1: 14.5, x2: 21, y2: 14.5, key: "j" })]),
  api: (p) => svg(p, [h("path", { d: "M9.5 4.5A2.5 2.5 0 0 0 7 7V10A2 2 0 0 1 5 12A2 2 0 0 1 7 14V17A2.5 2.5 0 0 0 9.5 19.5", key: "a" }), h("path", { d: "M14.5 4.5A2.5 2.5 0 0 1 17 7V10A2 2 0 0 0 19 12A2 2 0 0 0 17 14V17A2.5 2.5 0 0 1 14.5 19.5", key: "b" })]),
  log: (p) => svg(p, [h("line", { x1: 3.5, y1: 7, x2: 7.5, y2: 7, key: "a" }), h("line", { x1: 10, y1: 7, x2: 20.5, y2: 7, key: "b" }), h("line", { x1: 3.5, y1: 12, x2: 7.5, y2: 12, key: "c" }), h("line", { x1: 10, y1: 12, x2: 20.5, y2: 12, key: "d" }), h("line", { x1: 3.5, y1: 17, x2: 7.5, y2: 17, key: "e" }), h("line", { x1: 10, y1: 17, x2: 20.5, y2: 17, key: "f" })]),
  plug: (p) => svg(p, [h("line", { x1: 9, y1: 3.5, x2: 9, y2: 8, key: "a" }), h("line", { x1: 15, y1: 3.5, x2: 15, y2: 8, key: "b" }), h("path", { d: "M6.5 8H17.5V12A5.5 5.5 0 0 1 6.5 12Z", key: "c" }), h("line", { x1: 12, y1: 17.5, x2: 12, y2: 20.5, key: "d" })]),
  power: (p) => svg(p, [h("path", { d: "M7.08 5.7A8 8 0 1 0 16.92 5.7", key: "a" }), h("line", { x1: 12, y1: 3, x2: 12, y2: 11.5, key: "b" })]),
  gauge: (p) => svg(p, [h("path", { d: "M4 16A8 8 0 0 1 20 16", key: "a" }), h("line", { x1: 12, y1: 16, x2: 7.02, y2: 11.82, key: "b" }), h("circle", { cx: 12, cy: 16, r: 1.6, fill: "currentColor", stroke: "none", key: "c" })]),
  package: (p) => svg(p, [h("path", { d: "M3.5 8H20.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19Z", key: "a" }), h("polyline", { points: "3.5 8 6 4 18 4 20.5 8", key: "b" }), h("line", { x1: 12, y1: 4, x2: 12, y2: 20.5, key: "c" })]),
  pulse: (p) => svg(p, h("polyline", { points: "3 12 7.5 12 9.5 6.5 13 17.5 15 12 21 12", key: "a" })),
  monitor: (p) => svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V14.5A2 2 0 0 1 19 16.5H5A2 2 0 0 1 3 14.5Z", key: "a" }), h("line", { x1: 12, y1: 16.5, x2: 12, y2: 20, key: "b" }), h("line", { x1: 8, y1: 20, x2: 16, y2: 20, key: "c" })]),
  sun: (p) => svg(p, [h("circle", { cx: 12, cy: 12, r: 3.2, key: "a" }), h("line", { x1: 17.8, y1: 12, x2: 21.2, y2: 12, key: "b" }), h("line", { x1: 16.44, y1: 8.27, x2: 19.05, y2: 6.09, key: "c" }), h("line", { x1: 12, y1: 6.2, x2: 12, y2: 2.8, key: "d" }), h("line", { x1: 7.56, y1: 8.27, x2: 4.95, y2: 6.09, key: "e" }), h("line", { x1: 6.2, y1: 12, x2: 2.8, y2: 12, key: "f" }), h("line", { x1: 7.56, y1: 15.73, x2: 4.95, y2: 17.91, key: "g" }), h("line", { x1: 12, y1: 17.8, x2: 12, y2: 21.2, key: "h" }), h("line", { x1: 16.44, y1: 15.73, x2: 19.05, y2: 17.91, key: "i" })]),
  moon: (p) => svg(p, h("path", { d: "M15.2 3.6A8.6 8.6 0 1 0 20.4 15.4A6.9 6.9 0 0 1 15.2 3.6Z", key: "a" })),
  signIn: (p) => svg(p, [h("path", { d: "M13.5 3.5H18.5A2 2 0 0 1 20.5 5.5V18.5A2 2 0 0 1 18.5 20.5H13.5", key: "a" }), h("line", { x1: 3.5, y1: 12, x2: 12, y2: 12, key: "b" }), h("polyline", { points: "8.78 14.7 12 12 8.78 9.3", key: "c" })]),
  signOut: (p) => svg(p, [h("path", { d: "M10.5 3.5H5.5A2 2 0 0 0 3.5 5.5V18.5A2 2 0 0 0 5.5 20.5H10.5", key: "a" }), h("line", { x1: 9, y1: 12, x2: 20, y2: 12, key: "b" }), h("polyline", { points: "16.78 14.7 20 12 16.78 9.3", key: "c" })]),
  shieldCheck: (p) => svg(p, [h("path", { d: "M12 3.4 19.6 6.3 V12.4 C19.6 16.6 16.2 19.4 12 20.6 C7.8 19.4 4.4 16.6 4.4 12.4 V6.3 Z", key: "a" }), h("polyline", { points: "8 12.2 10.5 14.3 16 9.68", key: "b" })]),
  eyeOff: (p) => svg(p, [h("path", { d: "M9.1 6.5C10 6.2 11 6 12 6C15.6 6 19 8 21.5 12C20.5 13.6 19.4 14.9 18.1 15.9", key: "a" }), h("path", { d: "M14.8 17.6C13.9 17.9 13 18 12 18C8.4 18 5 16 2.5 12C3.7 10.1 5.1 8.6 6.6 7.5", key: "b" }), h("line", { x1: 4.5, y1: 4.5, x2: 19.5, y2: 17.09, key: "c" })]),
  zoomIn: (p) => svg(p, [h("path", { d: "M12.84 16.02 A6 6 0 1 1 16.35 11.85", key: "a" }), h("line", { x1: 15.1, y1: 14.36, x2: 20.5, y2: 18.89, key: "b" }), h("line", { x1: 7.5, y1: 10.5, x2: 13.5, y2: 10.5, key: "c" }), h("line", { x1: 10.5, y1: 7.5, x2: 10.5, y2: 13.5, key: "d" })]),
  zoomOut: (p) => svg(p, [h("path", { d: "M12.84 16.02 A6 6 0 1 1 16.35 11.85", key: "a" }), h("line", { x1: 15.1, y1: 14.36, x2: 20.5, y2: 18.89, key: "b" }), h("line", { x1: 7.5, y1: 10.5, x2: 13.5, y2: 10.5, key: "c" })]),
  userPlus: (p) => svg(p, [h("path", { d: "M13.06 7.44 A3.6 3.6 0 1 1 10.67 4.6", key: "a" }), h("path", { d: "M3 20.5C3 17.4 5.9 15.2 9.5 15.2C13.1 15.2 16 17.4 16 20.5", key: "b" }), h("line", { x1: 18.5, y1: 3.7, x2: 18.5, y2: 9.3, key: "c" }), h("line", { x1: 15.7, y1: 6.5, x2: 21.3, y2: 6.5, key: "d" })]),
  userCheck: (p) => svg(p, [h("path", { d: "M13.06 7.44 A3.6 3.6 0 1 1 10.67 4.6", key: "a" }), h("path", { d: "M3 20.5C3 17.4 5.9 15.2 9.5 15.2C13.1 15.2 16 17.4 16 20.5", key: "b" }), h("polyline", { points: "15.6 6.4 17.6 8.08 21 5.22", key: "c" })]),
  userX: (p) => svg(p, [h("path", { d: "M13.06 7.44 A3.6 3.6 0 1 1 10.67 4.6", key: "a" }), h("path", { d: "M3 20.5C3 17.4 5.9 15.2 9.5 15.2C13.1 15.2 16 17.4 16 20.5", key: "b" }), h("line", { x1: 16.3, y1: 4.3, x2: 20.7, y2: 8.7, key: "c" }), h("line", { x1: 20.7, y1: 4.3, x2: 16.3, y2: 8.7, key: "d" })]),
  userSearch: (p) => svg(p, [h("path", { d: "M11.16 8 A3.2 3.2 0 1 1 9.04 5.47", key: "a" }), h("path", { d: "M2.5 20.5C2.5 17.8 4.9 15.9 8 15.9C11.1 15.9 13.5 17.8 13.5 20.5", key: "b" }), h("path", { d: "M13.4 9.5A3.4 3.4 0 1 1 20.2 9.5A3.4 3.4 0 1 1 13.4 9.5", key: "c" }), h("line", { x1: 19.2, y1: 11.9, x2: 20.8, y2: 13.24, key: "d" })]),
  userOff: (p) => svg(p, [h("path", { d: "M8 8A4 4 0 1 1 16 8A4 4 0 1 1 8 8", key: "a" }), h("path", { d: "M4.5 20.5C4.5 16.9 7.9 14.5 12 14.5C16.1 14.5 19.5 16.9 19.5 20.5", key: "b" }), h("line", { x1: 4.5, y1: 4.5, x2: 19.5, y2: 17.09, key: "c" })]),
  usersPlus: (p) => svg(p, [h("path", { d: "M13.06 7.44 A3.6 3.6 0 1 1 10.67 4.6", key: "a" }), h("path", { d: "M3 20.5C3 17.4 5.9 15.2 9.5 15.2C13.1 15.2 16 17.4 16 20.5", key: "b" }), h("path", { d: "M16.2 5.2A3.6 3.6 0 0 1 16.2 11.9", key: "c" }), h("line", { x1: 18.5, y1: 15.5, x2: 18.5, y2: 20.5, key: "d" }), h("line", { x1: 16, y1: 18, x2: 21, y2: 18, key: "e" })]),
  hierarchy: (p) => svg(p, [h("path", { d: "M9 3H13A2 2 0 0 1 15 5V5.5A2 2 0 0 1 13 7.5H11A2 2 0 0 1 9 5.5Z", key: "a" }), h("line", { x1: 12, y1: 7.5, x2: 12, y2: 10.5, key: "b" }), h("line", { x1: 6, y1: 10.5, x2: 18, y2: 10.5, key: "c" }), h("line", { x1: 6, y1: 10.5, x2: 6, y2: 13.5, key: "d" }), h("line", { x1: 18, y1: 10.5, x2: 18, y2: 13.5, key: "e" }), h("path", { d: "M3 13.5H7A2 2 0 0 1 9 15.5V16A2 2 0 0 1 7 18H5A2 2 0 0 1 3 16Z", key: "f" }), h("path", { d: "M15 13.5H19A2 2 0 0 1 21 15.5V16A2 2 0 0 1 19 18H17A2 2 0 0 1 15 16Z", key: "g" })]),
  idCard: (p) => svg(p, [h("path", { d: "M3 5H19A2 2 0 0 1 21 7V17A2 2 0 0 1 19 19H5A2 2 0 0 1 3 17Z", key: "a" }), h("path", { d: "M10.37 10.12 A2.4 2.4 0 1 1 8.78 8.23", key: "b" }), h("path", { d: "M4.8 15.8C4.8 14 6.2 12.9 8 12.9C9.8 12.9 11.2 14 11.2 15.8", key: "c" }), h("line", { x1: 13.5, y1: 10, x2: 18.5, y2: 10, key: "d" }), h("line", { x1: 13.5, y1: 13.5, x2: 18.5, y2: 13.5, key: "e" })]),
  permission: (p) => svg(p, [h("path", { d: "M8 10.5V8A4 4 0 0 1 16 8V10.5", key: "a" }), h("path", { d: "M4.5 10.5H17.5A2 2 0 0 1 19.5 12.5V18.5A2 2 0 0 1 17.5 20.5H6.5A2 2 0 0 1 4.5 18.5Z", key: "b" }), h("polyline", { points: "8.5 15.5 10.7 17.35 15.5 13.32", key: "c" })]),
  resume: (p) => svg(p, [h("path", { d: "M5.5 3H14L18.5 7.5V19.5A1.5 1.5 0 0 1 17 21H7A1.5 1.5 0 0 1 5.5 19.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.5 18.5 7.5", key: "b" }), h("path", { d: "M9.5 11.4A2.2 2.2 0 1 1 13.9 11.4A2.2 2.2 0 1 1 9.5 11.4", key: "c" }), h("path", { d: "M8.4 17.4C8.4 15.3 9.9 14.2 11.7 14.2C13.5 14.2 15 15.3 15 17.4", key: "d" })]),
  interview: (p) => svg(p, [h("path", { d: "M10.36 7.35 A2.9 2.9 0 1 1 8.44 5.06", key: "a" }), h("path", { d: "M4.2 16C4.2 13.7 5.7 12.4 7.5 12.4C9.3 12.4 10.8 13.7 10.8 16", key: "b" }), h("path", { d: "M19.36 7.35 A2.9 2.9 0 1 1 17.44 5.06", key: "c" }), h("path", { d: "M13.2 16C13.2 13.7 14.7 12.4 16.5 12.4C18.3 12.4 19.8 13.7 19.8 16", key: "d" }), h("line", { x1: 3, y1: 19, x2: 21, y2: 19, key: "e" })]),
  invite: (p) => svg(p, [h("path", { d: "M3 4.5H15A2 2 0 0 1 17 6.5V14.5A2 2 0 0 1 15 16.5H5A2 2 0 0 1 3 14.5Z", key: "a" }), h("polyline", { points: "3 6.8 10 11.3 17 6.8", key: "b" }), h("line", { x1: 19, y1: 17, x2: 19, y2: 21, key: "c" }), h("line", { x1: 17, y1: 19, x2: 21, y2: 19, key: "d" })]),
  roster: (p) => svg(p, [h("path", { d: "M3.6 6A1.9 1.9 0 1 1 7.4 6A1.9 1.9 0 1 1 3.6 6", key: "a" }), h("line", { x1: 9.5, y1: 6, x2: 20.5, y2: 6, key: "b" }), h("path", { d: "M3.6 12A1.9 1.9 0 1 1 7.4 12A1.9 1.9 0 1 1 3.6 12", key: "c" }), h("line", { x1: 9.5, y1: 12, x2: 20.5, y2: 12, key: "d" }), h("path", { d: "M3.6 18A1.9 1.9 0 1 1 7.4 18A1.9 1.9 0 1 1 3.6 18", key: "e" }), h("line", { x1: 9.5, y1: 18, x2: 20.5, y2: 18, key: "f" })]),
  timer: (p) => svg(p, [h("path", { d: "M4.5 13.5A7.5 7.5 0 1 1 19.5 13.5A7.5 7.5 0 1 1 4.5 13.5", key: "a" }), h("line", { x1: 12, y1: 3.5, x2: 12, y2: 6, key: "b" }), h("line", { x1: 9.5, y1: 3.5, x2: 14.5, y2: 3.5, key: "c" }), h("line", { x1: 12, y1: 13.5, x2: 12, y2: 8.8, key: "d" })]),
  clockAlert: (p) => svg(p, [h("path", { d: "M3.7 12A6.8 6.8 0 1 1 17.3 12A6.8 6.8 0 1 1 3.7 12", key: "a" }), h("polyline", { points: "10.5 7.6 10.5 12.3 13.9 14", key: "b" }), h("line", { x1: 19.5, y1: 13, x2: 19.5, y2: 17, key: "c" }), h("rect", { x: 18.5, y: 18.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "d" })]),
  hourglass: (p) => svg(p, h("path", { d: "M6.5 3.5H17.5V7.385L12 12 17.5 16.615V20.5H6.5V16.615L12 12 6.5 7.385Z", key: "a" })),
  calendarPlus: (p) => svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10, key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7, key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7, key: "d" }), h("line", { x1: 12, y1: 12.5, x2: 12, y2: 18, key: "e" }), h("line", { x1: 8.75, y1: 15.25, x2: 15.25, y2: 15.25, key: "f" })]),
  calendarCheck: (p) => svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10, key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7, key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7, key: "d" }), h("polyline", { points: "8.3 15.1 10.9 17.28 15.9 13.08", key: "e" })]),
  calendarX: (p) => svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10, key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7, key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7, key: "d" }), h("line", { x1: 9.2, y1: 12.7, x2: 14.8, y2: 18.3, key: "e" }), h("line", { x1: 14.8, y1: 12.7, x2: 9.2, y2: 18.3, key: "f" })]),
  calendarRange: (p) => svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10, key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7, key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7, key: "d" }), h("rect", { x: 7, y: 14, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "e" }), h("rect", { x: 15, y: 14, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "f" }), h("line", { x1: 9, y1: 15, x2: 15, y2: 15, key: "g" })]),
  calendarGrid: (p) => svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10, key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7, key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7, key: "d" }), h("rect", { x: 6.5, y: 12.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "e" }), h("rect", { x: 11, y: 12.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "f" }), h("rect", { x: 15.5, y: 12.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "g" }), h("rect", { x: 6.5, y: 16.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "h" }), h("rect", { x: 11, y: 16.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "i" })]),
  calendarClock: (p) => svg(p, [h("path", { d: "M17.5 11.5V7A2 2 0 0 0 15.5 5H3.5V16.5A2 2 0 0 0 5.5 18.5H11", key: "a" }), h("line", { x1: 3.5, y1: 9.5, x2: 17.5, y2: 9.5, key: "b" }), h("line", { x1: 7, y1: 3, x2: 7, y2: 6.5, key: "c" }), h("line", { x1: 14, y1: 3, x2: 14, y2: 6.5, key: "d" }), h("path", { d: "M12.8 16.5A4 4 0 1 1 20.8 16.5A4 4 0 1 1 12.8 16.5", key: "e" }), h("polyline", { points: "16.8 14.2 16.8 16.5 18.6 17.4", key: "f" })]),
  repeat: (p) => svg(p, [h("path", { d: "M4.5 11V9.5A2.5 2.5 0 0 1 7 7H17", key: "a" }), h("polyline", { points: "13.78 9.7 17 7 13.78 4.3", key: "b" }), h("path", { d: "M19.5 13V14.5A2.5 2.5 0 0 1 17 17H7", key: "c" }), h("polyline", { points: "10.22 14.3 7 17 10.22 19.7", key: "d" })]),
  alarm: (p) => svg(p, [h("path", { d: "M5 13.5A7 7 0 1 1 19 13.5A7 7 0 1 1 5 13.5", key: "a" }), h("path", { d: "M3.5 7.4A4 4 0 0 1 7.4 4.3", key: "b" }), h("path", { d: "M20.5 7.4A4 4 0 0 0 16.6 4.3", key: "c" }), h("polyline", { points: "12 9.3 12 13.5 15.2 15.2", key: "d" })]),
  desk: (p) => svg(p, [h("line", { x1: 3, y1: 11, x2: 21, y2: 11, key: "a" }), h("line", { x1: 5.5, y1: 11, x2: 5.5, y2: 20.5, key: "b" }), h("line", { x1: 18.5, y1: 11, x2: 18.5, y2: 20.5, key: "c" }), h("path", { d: "M9 4H13A2 2 0 0 1 15 6V7A2 2 0 0 1 13 9H11A2 2 0 0 1 9 7Z", key: "d" }), h("line", { x1: 12, y1: 9, x2: 12, y2: 11, key: "e" })]),
  browser: (p) => svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z", key: "a" }), h("line", { x1: 3, y1: 9, x2: 21, y2: 9, key: "b" }), h("rect", { x: 5.5, y: 6.2, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none", key: "c" }), h("rect", { x: 8.3, y: 6.2, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none", key: "d" })]),
  kanban: (p) => svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z", key: "a" }), h("line", { x1: 9, y1: 4.5, x2: 9, y2: 19.5, key: "b" }), h("line", { x1: 15, y1: 4.5, x2: 15, y2: 19.5, key: "c" }), h("rect", { x: 4.5, y: 7.5, width: 3, height: 1.8, fill: "currentColor", stroke: "none", key: "d" }), h("rect", { x: 4.5, y: 11, width: 3, height: 1.8, fill: "currentColor", stroke: "none", key: "e" }), h("rect", { x: 10.5, y: 7.5, width: 3, height: 1.8, fill: "currentColor", stroke: "none", key: "f" }), h("rect", { x: 16.5, y: 7.5, width: 3, height: 1.8, fill: "currentColor", stroke: "none", key: "g" })]),
  pipeline: (p) => svg(p, [h("line", { x1: 3, y1: 4.5, x2: 3, y2: 19.5, key: "a" }), h("rect", { x: 5.5, y: 5, width: 15, height: 3, fill: "currentColor", stroke: "none", key: "b" }), h("rect", { x: 5.5, y: 10.5, width: 11, height: 3, fill: "currentColor", stroke: "none", key: "c" }), h("rect", { x: 5.5, y: 16, width: 7, height: 3, fill: "currentColor", stroke: "none", key: "d" })]),
  target: (p) => svg(p, [h("path", { d: "M3.5 12A8.5 8.5 0 1 1 20.5 12A8.5 8.5 0 1 1 3.5 12", key: "a" }), h("path", { d: "M7.5 12A4.5 4.5 0 1 1 16.5 12A4.5 4.5 0 1 1 7.5 12", key: "b" }), h("circle", { cx: 12, cy: 12, r: 1.8, fill: "currentColor", stroke: "none", key: "c" })]),
  presentation: (p) => svg(p, [h("path", { d: "M3 3.5H19A2 2 0 0 1 21 5.5V13A2 2 0 0 1 19 15H5A2 2 0 0 1 3 13Z", key: "a" }), h("line", { x1: 12, y1: 15, x2: 12, y2: 18, key: "b" }), h("line", { x1: 8.5, y1: 20.5, x2: 15.5, y2: 20.5, key: "c" }), h("line", { x1: 8, y1: 12, x2: 8, y2: 9, key: "d" }), h("line", { x1: 12, y1: 12, x2: 12, y2: 7, key: "e" }), h("line", { x1: 16, y1: 12, x2: 16, y2: 10, key: "f" })]),
  mobile: (p) => svg(p, [h("path", { d: "M7 3H15A2 2 0 0 1 17 5V19A2 2 0 0 1 15 21H9A2 2 0 0 1 7 19Z", key: "a" }), h("line", { x1: 10.5, y1: 17.5, x2: 13.5, y2: 17.5, key: "b" })]),
  note: (p) => svg(p, [h("path", { d: "M4 3.5H20V15.5L14.5 21H5.5A1.5 1.5 0 0 1 4 19.5Z", key: "a" }), h("polyline", { points: "20 15.5 14.5 15.5 14.5 21", key: "b" }), h("line", { x1: 7, y1: 8, x2: 17, y2: 8, key: "c" }), h("line", { x1: 7, y1: 11.5, x2: 17, y2: 11.5, key: "d" })]),
  book: (p) => svg(p, [h("path", { d: "M4.5 3.5H17.5A2 2 0 0 1 19.5 5.5V18.5A2 2 0 0 1 17.5 20.5H6.5A2 2 0 0 1 4.5 18.5Z", key: "a" }), h("line", { x1: 8, y1: 3.5, x2: 8, y2: 20.5, key: "b" }), h("line", { x1: 10.8, y1: 8, x2: 16.8, y2: 8, key: "c" }), h("line", { x1: 10.8, y1: 11.5, x2: 15, y2: 11.5, key: "d" })]),
  bookOpen: (p) => svg(p, [h("path", { d: "M12 7.2C10.6 5.9 8.4 5 6 5H3.5V17.5H6C8.4 17.5 10.6 18.4 12 19.7", key: "a" }), h("path", { d: "M12 7.2C13.4 5.9 15.6 5 18 5H20.5V17.5H18C15.6 17.5 13.4 18.4 12 19.7", key: "b" })]),
  lightbulb: (p) => svg(p, [h("path", { d: "M8.6 15.4A5.6 5.6 0 1 1 15.4 15.4V17.5H8.6Z", key: "a" }), h("line", { x1: 9.5, y1: 19.5, x2: 14.5, y2: 19.5, key: "b" }), h("line", { x1: 10.5, y1: 21, x2: 13.5, y2: 21, key: "c" })]),
  map: (p) => svg(p, [h("polyline", { points: "3.5 6.5 9 4 15 7 20.5 4.5 20.5 17.5 15 20 9 17 3.5 19.5 3.5 6.5", key: "a" }), h("line", { x1: 9, y1: 4, x2: 9, y2: 17, key: "b" }), h("line", { x1: 15, y1: 7, x2: 15, y2: 20, key: "c" })]),
  barcode: (p) => svg(p, [h("rect", { x: 3.5, y: 5, width: 1.5, height: 14, fill: "currentColor", stroke: "none", key: "a" }), h("line", { x1: 7, y1: 5, x2: 7, y2: 19, key: "b" }), h("rect", { x: 9, y: 5, width: 2.5, height: 14, fill: "currentColor", stroke: "none", key: "c" }), h("line", { x1: 13, y1: 5, x2: 13, y2: 19, key: "d" }), h("line", { x1: 15, y1: 5, x2: 15, y2: 19, key: "e" }), h("rect", { x: 17, y: 5, width: 1.5, height: 14, fill: "currentColor", stroke: "none", key: "f" }), h("line", { x1: 20, y1: 5, x2: 20, y2: 19, key: "g" })]),
  print: (p) => svg(p, [h("path", { d: "M7 8V3.5H17V8", key: "a" }), h("path", { d: "M3.5 8H18.5A2 2 0 0 1 20.5 10V14A2 2 0 0 1 18.5 16H5.5A2 2 0 0 1 3.5 14Z", key: "b" }), h("path", { d: "M7 14H17V20.5H7Z", key: "c" }), h("rect", { x: 16.5, y: 10.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "d" })]),
  qr: (p) => svg(p, [h("rect", { x: 3.5, y: 3.5, width: 6, height: 6, key: "a" }), h("rect", { x: 5.5, y: 5.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "b" }), h("rect", { x: 14.5, y: 3.5, width: 6, height: 6, key: "c" }), h("rect", { x: 16.5, y: 5.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "d" }), h("rect", { x: 3.5, y: 14.5, width: 6, height: 6, key: "e" }), h("rect", { x: 5.5, y: 16.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "f" }), h("rect", { x: 14.5, y: 14.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "g" }), h("rect", { x: 18.5, y: 18.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "h" })]),
  move: (p) => svg(p, [h("line", { x1: 12, y1: 4, x2: 12, y2: 20, key: "a" }), h("line", { x1: 4, y1: 12, x2: 20, y2: 12, key: "b" }), h("polyline", { points: "14.06 6.45 12 4 9.94 6.45", key: "c" }), h("polyline", { points: "9.94 17.55 12 20 14.06 17.55", key: "d" }), h("polyline", { points: "6.45 9.94 4 12 6.45 14.06", key: "e" }), h("polyline", { points: "17.55 14.06 20 12 17.55 9.94", key: "f" })]),
  keyboard: (p) => svg(p, [h("path", { d: "M3 6.5H19A2 2 0 0 1 21 8.5V15.5A2 2 0 0 1 19 17.5H5A2 2 0 0 1 3 15.5Z", key: "a" }), h("rect", { x: 6, y: 9.5, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none", key: "b" }), h("rect", { x: 9.5, y: 9.5, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none", key: "c" }), h("rect", { x: 13, y: 9.5, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none", key: "d" }), h("rect", { x: 16.5, y: 9.5, width: 1.6, height: 1.6, fill: "currentColor", stroke: "none", key: "e" }), h("line", { x1: 8, y1: 14.5, x2: 16, y2: 14.5, key: "f" })]),
  split: (p) => svg(p, [h("line", { x1: 3.5, y1: 12, x2: 13, y2: 12, key: "a" }), h("path", { d: "M13 12A2 2 0 0 0 15 10V7H20.5", key: "b" }), h("path", { d: "M13 12A2 2 0 0 1 15 14V17H20.5", key: "c" })]),
  merge: (p) => svg(p, [h("line", { x1: 11, y1: 12, x2: 20.5, y2: 12, key: "a" }), h("path", { d: "M11 12A2 2 0 0 1 9 10V7H3.5", key: "b" }), h("path", { d: "M11 12A2 2 0 0 0 9 14V17H3.5", key: "c" })]),
  dragHandle: (p) => svg(p, [h("rect", { x: 8.5, y: 5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "a" }), h("rect", { x: 13.5, y: 5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "b" }), h("rect", { x: 8.5, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" }), h("rect", { x: 13.5, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "d" }), h("rect", { x: 8.5, y: 17, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "e" }), h("rect", { x: 13.5, y: 17, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "f" })]),
  megaphone: (p) => svg(p, [h("path", { d: "M4 9.5 17 4.5V19.5L4 14.5Z", key: "a" }), h("path", { d: "M7.5 16V19.5A1.5 1.5 0 0 0 10.5 19.5V17.3", key: "b" }), h("line", { x1: 19, y1: 10, x2: 21, y2: 10, key: "c" }), h("line", { x1: 19, y1: 14, x2: 21, y2: 14, key: "d" })]),
  checkAll: (p) => svg(p, [h("polyline", { points: "3 12.3 7 15.66 14 9.79", key: "a" }), h("polyline", { points: "10 12.3 14 15.66 21 9.79", key: "b" })]),
  sliders: (p) => svg(p, [h("line", { x1: 3.5, y1: 7, x2: 20.5, y2: 7, key: "a" }), h("rect", { x: 8, y: 5.5, width: 3, height: 3, fill: "currentColor", stroke: "none", key: "b" }), h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12, key: "c" }), h("rect", { x: 13, y: 10.5, width: 3, height: 3, fill: "currentColor", stroke: "none", key: "d" }), h("line", { x1: 3.5, y1: 17, x2: 20.5, y2: 17, key: "e" }), h("rect", { x: 6, y: 15.5, width: 3, height: 3, fill: "currentColor", stroke: "none", key: "f" })]),
  accessibility: (p) => svg(p, [h("circle", { cx: 12, cy: 5.5, r: 2, fill: "currentColor", stroke: "none", key: "a" }), h("line", { x1: 4.5, y1: 9.5, x2: 19.5, y2: 9.5, key: "b" }), h("line", { x1: 12, y1: 9.5, x2: 12, y2: 14, key: "c" }), h("polyline", { points: "6.55 20.5 12 14 17.45 20.5", key: "d" })]),
  message: (p) => svg(p, h("path", { d: "M4 6.5A1.5 1.5 0 0 1 5.5 5H18.5A1.5 1.5 0 0 1 20 6.5V15.5A1.5 1.5 0 0 1 18.5 17H9.4L5 20.5V17H5.5A1.5 1.5 0 0 1 4 15.5Z", key: "a" })),
  messages: (p) => svg(p, [h("path", { d: "M3 5.5A1.5 1.5 0 0 1 4.5 4H15.5A1.5 1.5 0 0 1 17 5.5V12.5A1.5 1.5 0 0 1 15.5 14H8L4.5 17V14A1.5 1.5 0 0 1 3 12.5Z", key: "a" }), h("path", { d: "M20 8.5A1.5 1.5 0 0 1 21 10V17A1.5 1.5 0 0 1 19.5 18.5V21L16 18.5H10.5", key: "b" })]),
  comment: (p) => svg(p, [h("path", { d: "M4 6.5A1.5 1.5 0 0 1 5.5 5H18.5A1.5 1.5 0 0 1 20 6.5V15.5A1.5 1.5 0 0 1 18.5 17H9.4L5 20.5V17H5.5A1.5 1.5 0 0 1 4 15.5Z", key: "a" }), h("line", { x1: 8, y1: 9.5, x2: 16, y2: 9.5, key: "b" }), h("line", { x1: 8, y1: 12.8, x2: 13, y2: 12.8, key: "c" })]),
  bell: (p) => svg(p, [h("path", { d: "M7 10.5A5 5 0 0 1 17 10.5V15L19 18H5L7 15Z", key: "a" }), h("path", { d: "M10 18V19A2 2 0 0 0 14 19V18", key: "b" })]),
  bellOff: (p) => svg(p, [h("path", { d: "M7 10.5A5 5 0 0 1 12.8 5.6", key: "a" }), h("path", { d: "M17 11.6V15L19 18H8", key: "b" }), h("path", { d: "M5 18L7 15V12", key: "c" }), h("path", { d: "M10 18V19A2 2 0 0 0 14 19V18", key: "d" }), h("line", { x1: 4.5, y1: 4.5, x2: 19.5, y2: 17.09, key: "e" })]),
  phone: (p) => svg(p, h("path", { d: "M6.5 3.5H10L11.5 8 9.3 9.6A11 11 0 0 0 14.4 14.7L16 12.5 20.5 14V17.5A2.5 2.5 0 0 1 18 20C10.3 19.6 4.4 13.7 4 6A2.5 2.5 0 0 1 6.5 3.5Z", key: "a" })),
  videoCall: (p) => svg(p, [h("path", { d: "M3 6H13A2 2 0 0 1 15 8V16A2 2 0 0 1 13 18H5A2 2 0 0 1 3 16Z", key: "a" }), h("polyline", { points: "15 11 20.5 7.4 20.5 16.6 15 13", key: "b" })]),
  at: (p) => svg(p, [h("circle", { cx: 12, cy: 12, r: 4, key: "a" }), h("path", { d: "M16 8.4V13.5A2.8 2.8 0 0 0 21 12A9 9 0 1 0 17.2 19.3", key: "b" })]),
  hash: (p) => svg(p, [h("line", { x1: 4, y1: 9.2, x2: 20, y2: 9.2, key: "a" }), h("line", { x1: 4, y1: 15.4, x2: 20, y2: 15.4, key: "b" }), h("line", { x1: 10.4, y1: 3.6, x2: 8.2, y2: 20.4, key: "c" }), h("line", { x1: 16.6, y1: 3.6, x2: 14.4, y2: 20.4, key: "d" })]),
  share: (p) => svg(p, [h("circle", { cx: 6, cy: 12, r: 2.6, key: "a" }), h("circle", { cx: 18, cy: 6.5, r: 2.6, key: "b" }), h("circle", { cx: 18, cy: 17.5, r: 2.6, key: "c" }), h("line", { x1: 8.4, y1: 10.9, x2: 15.6, y2: 7.6, key: "d" }), h("line", { x1: 8.4, y1: 13.1, x2: 15.6, y2: 16.4, key: "e" })]),
  reply: (p) => svg(p, [h("polyline", { points: "8 5.5 3.5 10 8 14.5", key: "a" }), h("path", { d: "M3.5 10H15A5.5 5.5 0 0 1 15 21H10", key: "b" })]),
  inbox: (p) => svg(p, [h("path", { d: "M3.5 13H8.5L10 16H14L15.5 13H20.5", key: "a" }), h("path", { d: "M3.5 13 6.5 4.5H17.5L20.5 13V18.5A1.5 1.5 0 0 1 19 20H5A1.5 1.5 0 0 1 3.5 18.5Z", key: "b" })]),
  draft: (p) => svg(p, [h("path", { d: "M5.5 3H14L19 7.2V13", key: "a" }), h("path", { d: "M5.5 3V21H12", key: "b" }), h("line", { x1: 8.5, y1: 11, x2: 15, y2: 11, key: "c" }), h("path", { d: "M19.4 13.9 14.6 18.7V20.5H16.4L21.2 15.7Z", key: "d" })]),
  image: (p) => svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z", key: "a" }), h("polyline", { points: "4.5 17 9.6 11.2 13.5 15.6 15.9 13.1 19.5 17", key: "b" }), h("rect", { x: 6.4, y: 7.6, width: 2, height: 2, key: "c" })]),
  images: (p) => svg(p, [h("path", { d: "M7 8.5A1.5 1.5 0 0 1 8.5 7H19.5A1.5 1.5 0 0 1 21 8.5V17.5A1.5 1.5 0 0 1 19.5 19H8.5A1.5 1.5 0 0 1 7 17.5Z", key: "a" }), h("polyline", { points: "8 17.5 11.7 13.4 14.5 16.5 16.3 14.6 19.6 17.9", key: "b" }), h("path", { d: "M4 16.5V6.5A1.5 1.5 0 0 1 5.5 5H16", key: "c" })]),
  camera: (p) => svg(p, [h("path", { d: "M3.5 9A1.5 1.5 0 0 1 5 7.5H8L9.5 5H14.5L16 7.5H19A1.5 1.5 0 0 1 20.5 9V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z", key: "a" }), h("circle", { cx: 12, cy: 13, r: 3.6, key: "b" })]),
  video: (p) => svg(p, [h("path", { d: "M3 6H14A2 2 0 0 1 16 8V16A2 2 0 0 1 14 18H5A2 2 0 0 1 3 16Z", key: "a" }), h("polyline", { points: "16 11 20.5 8 20.5 16 16 13", key: "b" })]),
  mic: (p) => svg(p, [h("path", { d: "M12 3.5A2.6 2.6 0 0 1 14.6 6.1V12A2.6 2.6 0 0 1 9.4 12V6.1A2.6 2.6 0 0 1 12 3.5Z", key: "a" }), h("path", { d: "M6.5 11.5V12.5A5.5 5.5 0 0 0 17.5 12.5V11.5", key: "b" }), h("line", { x1: 12, y1: 18, x2: 12, y2: 20.5, key: "c" }), h("line", { x1: 8.5, y1: 20.5, x2: 15.5, y2: 20.5, key: "d" })]),
  micOff: (p) => svg(p, [h("path", { d: "M14.6 8.5V6.1A2.6 2.6 0 0 0 9.6 5.2", key: "a" }), h("path", { d: "M9.4 10.2V12A2.6 2.6 0 0 0 13.9 13.8", key: "b" }), h("path", { d: "M6.5 11.5V12.5A5.5 5.5 0 0 0 15.3 16.9", key: "c" }), h("path", { d: "M17.5 11.5V12.5", key: "d" }), h("line", { x1: 12, y1: 18, x2: 12, y2: 20.5, key: "e" }), h("line", { x1: 8.5, y1: 20.5, x2: 15.5, y2: 20.5, key: "f" }), h("line", { x1: 4.5, y1: 4.5, x2: 19.5, y2: 17.09, key: "g" })]),
  volume: (p) => svg(p, [h("polyline", { points: "3.5 9.5 7 9.5 11.5 5.5 11.5 18.5 7 14.5 3.5 14.5", key: "a" }), h("path", { d: "M15 9.5A4 4 0 0 1 15 14.5", key: "b" }), h("path", { d: "M17.8 6.7A8 8 0 0 1 17.8 17.3", key: "c" })]),
  volumeOff: (p) => svg(p, [h("polyline", { points: "3.5 9.5 7 9.5 11.5 5.5 11.5 18.5 7 14.5 3.5 14.5", key: "a" }), h("line", { x1: 15.5, y1: 9.6, x2: 20.5, y2: 13.8, key: "b" }), h("line", { x1: 20.5, y1: 9.6, x2: 15.5, y2: 13.8, key: "c" })]),
  pause: (p) => svg(p, [h("line", { x1: 9, y1: 5, x2: 9, y2: 19, key: "a" }), h("line", { x1: 15, y1: 5, x2: 15, y2: 19, key: "b" })]),
  skipBack: (p) => svg(p, [h("polyline", { points: "17 5.5 7 12 17 18.5", key: "a" }), h("line", { x1: 5.5, y1: 5.5, x2: 5.5, y2: 18.5, key: "b" })]),
  skipForward: (p) => svg(p, [h("polyline", { points: "7 5.5 17 12 7 18.5", key: "a" }), h("line", { x1: 18.5, y1: 5.5, x2: 18.5, y2: 18.5, key: "b" })]),
  record: (p) => svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5, key: "a" }), h("circle", { cx: 12, cy: 12, r: 4, fill: "currentColor", stroke: "none", key: "b" })]),
  help: (p) => svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5, key: "a" }), h("path", { d: "M9.4 9.6A2.7 2.7 0 0 1 14.7 10.3C14.7 12.2 12 12.6 12 14.4", key: "b" }), h("rect", { x: 11, y: 16.6, width: 2, height: 2, key: "c" })]),
  question: (p) => svg(p, [h("path", { d: "M9.4 8.4A2.9 2.9 0 0 1 15 9.2C15 11.3 12 11.8 12 13.8", key: "a" }), h("rect", { x: 11, y: 16.6, width: 2, height: 2, key: "b" })]),
  alert: (p) => svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5, key: "a" }), h("line", { x1: 12, y1: 7.6, x2: 12, y2: 13, key: "b" }), h("rect", { x: 11, y: 15.4, width: 2, height: 2, key: "c" })]),
  bug: (p) => svg(p, [h("path", { d: "M7.5 7.5H12.5A4 4 0 0 1 16.5 11.5V14.5A4 4 0 0 1 12.5 18.5H11.5A4 4 0 0 1 7.5 14.5Z", key: "a" }), h("line", { x1: 9.5, y1: 4.5, x2: 10.8, y2: 7.5, key: "b" }), h("line", { x1: 14.5, y1: 4.5, x2: 13.2, y2: 7.5, key: "c" }), h("line", { x1: 3.5, y1: 11, x2: 7.5, y2: 11, key: "d" }), h("line", { x1: 16.5, y1: 11, x2: 20.5, y2: 11, key: "e" }), h("line", { x1: 3.5, y1: 15.5, x2: 7.5, y2: 15.5, key: "f" }), h("line", { x1: 16.5, y1: 15.5, x2: 20.5, y2: 15.5, key: "g" }), h("line", { x1: 12, y1: 10, x2: 12, y2: 16, key: "h" })]),
  verified: (p) => svg(p, [h("path", { d: "M12 3.6 14.4 5.8 17.6 5.4 18 8.6 20.3 10.8 18.7 13.6 19.4 16.7 16.3 17.6 14.6 20.3 11.7 19 8.8 19.9 7.4 17.1 4.3 16.1 5.3 13 3.8 10.3 6.2 8.2 6.7 5.1 9.9 5.4Z", key: "a" }), h("polyline", { points: "8.6 12.1 10.9 14.03 15.4 10.25", key: "b" })]),
  pending: (p) => svg(p, [h("path", { d: "M3.5 12A8.5 8.5 0 1 1 20.5 12A8.5 8.5 0 1 1 3.5 12", key: "a" }), h("rect", { x: 6.6, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "b" }), h("rect", { x: 11, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" }), h("rect", { x: 15.4, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "d" })]),
  blocked: (p) => svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5, key: "a" }), h("line", { x1: 6, y1: 18, x2: 18, y2: 6, key: "b" })]),
  circleCheck: (p) => svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5, key: "a" }), h("polyline", { points: "8.3 12.1 10.6 14.03 15.5 9.92", key: "b" })]),
  circleX: (p) => svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5, key: "a" }), h("line", { x1: 9, y1: 9, x2: 15, y2: 15, key: "b" }), h("line", { x1: 15, y1: 9, x2: 9, y2: 15, key: "c" })]),
  circlePlus: (p) => svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5, key: "a" }), h("line", { x1: 12, y1: 8, x2: 12, y2: 16, key: "b" }), h("line", { x1: 8, y1: 12, x2: 16, y2: 12, key: "c" })]),
  circleMinus: (p) => svg(p, [h("circle", { cx: 12, cy: 12, r: 8.5, key: "a" }), h("line", { x1: 8, y1: 12, x2: 16, y2: 12, key: "b" })]),
  dot: (p) => svg(p, h("rect", { x: 9, y: 9, width: 6, height: 6, fill: "currentColor", stroke: "none", key: "a" })),
  card: (p) => svg(p, [h("path", { d: "M3 5.5H19A2 2 0 0 1 21 7.5V16.5A2 2 0 0 1 19 18.5H5A2 2 0 0 1 3 16.5Z", key: "a" }), h("line", { x1: 3, y1: 10, x2: 21, y2: 10, key: "b" }), h("line", { x1: 6.5, y1: 14.5, x2: 10.5, y2: 14.5, key: "c" })]),
  wallet: (p) => svg(p, [h("path", { d: "M3.5 7.5A2 2 0 0 1 5.5 5.5H17V8", key: "a" }), h("path", { d: "M3.5 7.5V17.5A2 2 0 0 0 5.5 19.5H19A1.5 1.5 0 0 0 20.5 18V9.5A1.5 1.5 0 0 0 19 8H3.5", key: "b" }), h("rect", { x: 15.5, y: 12, width: 2.4, height: 2.4, key: "c" })]),
  receipt: (p) => svg(p, [h("path", { d: "M6 3.5H18V21L15.6 19.2 13.2 21 10.8 19.2 8.4 21 6 19.2Z", key: "a" }), h("line", { x1: 9, y1: 8.5, x2: 15, y2: 8.5, key: "b" }), h("line", { x1: 9, y1: 12.5, x2: 15, y2: 12.5, key: "c" })]),
  tag: (p) => svg(p, [h("path", { d: "M11.4 3.5H20.5V12.6L12.2 20.9A1.5 1.5 0 0 1 10.1 20.9L3.1 13.9A1.5 1.5 0 0 1 3.1 11.8Z", key: "a" }), h("rect", { x: 16, y: 6.6, width: 2, height: 2, key: "b" })]),
  cart: (p) => svg(p, [h("polyline", { points: "3 4.5 6 4.5 8.3 15.5 18.5 15.5 20.5 8 7 8", key: "a" }), h("rect", { x: 8, y: 18, width: 2, height: 2, key: "b" }), h("rect", { x: 16.5, y: 18, width: 2, height: 2, key: "c" })]),
  percent: (p) => svg(p, [h("circle", { cx: 7.5, cy: 7.5, r: 2.8, key: "a" }), h("circle", { cx: 16.5, cy: 16.5, r: 2.8, key: "b" }), h("line", { x1: 18, y1: 6, x2: 6, y2: 18, key: "c" })]),
  coins: (p) => svg(p, [h("path", { d: "M3.5 8.5A4.5 2.5 0 0 1 12.5 8.5A4.5 2.5 0 0 1 3.5 8.5", key: "a" }), h("path", { d: "M3.5 8.5V13A4.5 2.5 0 0 0 12.5 13V8.5", key: "b" }), h("path", { d: "M11.5 15.5A4.5 2.5 0 0 0 20.5 15.5V11A4.5 2.5 0 0 0 13 9.1", key: "c" })]),
  bank: (p) => svg(p, [h("polyline", { points: "3 9.5 12 4 21 9.5", key: "a" }), h("line", { x1: 3, y1: 20.5, x2: 21, y2: 20.5, key: "b" }), h("line", { x1: 6.5, y1: 12, x2: 6.5, y2: 18, key: "c" }), h("line", { x1: 12, y1: 12, x2: 12, y2: 18, key: "d" }), h("line", { x1: 17.5, y1: 12, x2: 17.5, y2: 18, key: "e" })]),
  invoice: (p) => svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2", key: "b" }), h("line", { x1: 8.5, y1: 12, x2: 15.5, y2: 12, key: "c" }), h("line", { x1: 8.5, y1: 15, x2: 13, y2: 15, key: "d" }), h("line", { x1: 12, y1: 17.5, x2: 15.5, y2: 17.5, key: "e" })]),
  arrowUp: (p) => svg(p, [h("line", { x1: 12, y1: 19, x2: 12, y2: 5, key: "a" }), h("polyline", { points: "14.7 8.22 12 5 9.3 8.22", key: "b" })]),
  arrowUpLeft: (p) => svg(p, [h("line", { x1: 17.36, y1: 16.5, x2: 6.64, y2: 7.5, key: "a" }), h("polyline", { points: "10.84 7.5 6.64 7.5 7.37 11.64", key: "b" })]),
  arrowDownLeft: (p) => svg(p, [h("line", { x1: 17.36, y1: 7.5, x2: 6.64, y2: 16.5, key: "a" }), h("polyline", { points: "7.37 12.36 6.64 16.5 10.84 16.5", key: "b" })]),
  arrowDownRight: (p) => svg(p, [h("line", { x1: 6.64, y1: 7.5, x2: 17.36, y2: 16.5, key: "a" }), h("polyline", { points: "13.16 16.5 17.36 16.5 16.63 12.36", key: "b" })]),
  chevronsRight: (p) => svg(p, [h("polyline", { points: "8.41 14.96 11.93 12 8.41 9.04", key: "a" }), h("polyline", { points: "14.01 14.96 17.53 12 14.01 9.04", key: "b" })]),
  chevronsLeft: (p) => svg(p, [h("polyline", { points: "15.59 9.04 12.07 12 15.59 14.96", key: "a" }), h("polyline", { points: "9.99 9.04 6.47 12 9.99 14.96", key: "b" })]),
  chevronsUp: (p) => svg(p, [h("polyline", { points: "14.96 15.59 12 12.07 9.04 15.59", key: "a" }), h("polyline", { points: "14.96 9.99 12 6.47 9.04 9.99", key: "b" })]),
  chevronsDown: (p) => svg(p, [h("polyline", { points: "9.04 8.41 12 11.93 14.96 8.41", key: "a" }), h("polyline", { points: "9.04 14.01 12 17.53 14.96 14.01", key: "b" })]),
  home: (p) => svg(p, [h("path", { d: "M3.5 11.4 12 4.3 20.5 11.4", key: "a" }), h("path", { d: "M6 9.4V20.3H18V9.4", key: "b" }), h("line", { x1: 10.3, y1: 20.3, x2: 10.3, y2: 14.8, key: "c" }), h("line", { x1: 13.7, y1: 20.3, x2: 13.7, y2: 14.8, key: "d" })]),
  back: (p) => svg(p, [h("line", { x1: 20, y1: 12, x2: 5, y2: 12, key: "a" }), h("polyline", { points: "8.22 9.3 5 12 8.22 14.7", key: "b" })]),
  forward: (p) => svg(p, [h("line", { x1: 4, y1: 12, x2: 19, y2: 12, key: "a" }), h("polyline", { points: "15.78 14.7 19 12 15.78 9.3", key: "b" })]),
  expand: (p) => svg(p, [h("polyline", { points: "9.5 4 4 4 4 9.5", key: "a" }), h("polyline", { points: "14.5 20 20 20 20 14.5", key: "b" }), h("line", { x1: 4, y1: 4, x2: 10, y2: 9.03, key: "c" }), h("line", { x1: 20, y1: 20, x2: 14, y2: 14.97, key: "d" })]),
  collapse: (p) => svg(p, [h("polyline", { points: "4 9.5 9.5 9.5 9.5 4", key: "a" }), h("polyline", { points: "20 14.5 14.5 14.5 14.5 20", key: "b" }), h("line", { x1: 9.5, y1: 9.5, x2: 4, y2: 4.39, key: "c" }), h("line", { x1: 14.5, y1: 14.5, x2: 20, y2: 19.61, key: "d" })]),
  maximize: (p) => svg(p, h("path", { d: "M4 4H18A2 2 0 0 1 20 6V18A2 2 0 0 1 18 20H6A2 2 0 0 1 4 18Z", key: "a" })),
  minimize: (p) => svg(p, [h("path", { d: "M3.5 4.5H18.5A2 2 0 0 1 20.5 6.5V11.5A2 2 0 0 1 18.5 13.5H5.5A2 2 0 0 1 3.5 11.5Z", key: "a" }), h("rect", { x: 3.5, y: 17.5, width: 17, height: 3, fill: "currentColor", stroke: "none", key: "b" })]),
  fullscreen: (p) => svg(p, [h("polyline", { points: "9 4 4 4 4 9", key: "a" }), h("polyline", { points: "15 4 20 4 20 9", key: "b" }), h("polyline", { points: "9 20 4 20 4 15", key: "c" }), h("polyline", { points: "15 20 20 20 20 15", key: "d" })]),
  sidebar: (p) => svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z", key: "a" }), h("line", { x1: 9.5, y1: 4.5, x2: 9.5, y2: 19.5, key: "b" })]),
  panelRight: (p) => svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z", key: "a" }), h("line", { x1: 14.5, y1: 4.5, x2: 14.5, y2: 19.5, key: "b" })]),
  layout: (p) => svg(p, [h("path", { d: "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z", key: "a" }), h("line", { x1: 3, y1: 10, x2: 21, y2: 10, key: "b" }), h("line", { x1: 11, y1: 10, x2: 11, y2: 19.5, key: "c" })]),
  fileText: (p) => svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2", key: "b" }), h("line", { x1: 8.5, y1: 12, x2: 15.5, y2: 12, key: "c" }), h("line", { x1: 8.5, y1: 15.5, x2: 13.5, y2: 15.5, key: "d" }), h("line", { x1: 8.5, y1: 18.5, x2: 12, y2: 18.5, key: "e" })]),
  fileCode: (p) => svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2", key: "b" }), h("polyline", { points: "11 13.4 8.7 15.7 11 18", key: "c" }), h("polyline", { points: "14 13.4 16.3 15.7 14 18", key: "d" })]),
  fileSheet: (p) => svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2", key: "b" }), h("line", { x1: 8.5, y1: 12.5, x2: 16, y2: 12.5, key: "c" }), h("line", { x1: 8.5, y1: 16, x2: 16, y2: 16, key: "d" }), h("line", { x1: 12, y1: 12.5, x2: 12, y2: 19.5, key: "e" }), h("line", { x1: 8.5, y1: 19.5, x2: 16, y2: 19.5, key: "f" })]),
  fileImage: (p) => svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2", key: "b" }), h("polyline", { points: "8 18.5 11.2 14.8 13.8 17.8 15.3 16.1 17 18.5", key: "c" }), h("rect", { x: 8.3, y: 11.3, width: 1.6, height: 1.6, key: "d" })]),
  fileZip: (p) => svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2", key: "b" }), h("line", { x1: 11.2, y1: 10, x2: 12.8, y2: 10, key: "c" }), h("line", { x1: 11.2, y1: 13, x2: 12.8, y2: 13, key: "d" }), h("line", { x1: 11.2, y1: 16, x2: 12.8, y2: 16, key: "e" }), h("rect", { x: 11.2, y: 18.4, width: 1.6, height: 1.6, key: "f" })]),
  filePdf: (p) => svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2", key: "b" }), h("line", { x1: 8.5, y1: 13.5, x2: 15.5, y2: 13.5, key: "c" }), h("line", { x1: 8.5, y1: 16.5, x2: 12.5, y2: 16.5, key: "d" })]),
  folder: (p) => svg(p, h("path", { d: "M3 7.5H9.5L11.6 10.3H21V19.5A1.5 1.5 0 0 1 19.5 21H4.5A1.5 1.5 0 0 1 3 19.5Z", key: "a" })),
  folderOpen: (p) => svg(p, [h("path", { d: "M3 7.5H9.5L11.6 10.3H19V12.5", key: "a" }), h("path", { d: "M3 7.5V19.5A1.5 1.5 0 0 0 4.5 21H18.6L21.5 12.5H5.9Z", key: "b" })]),
  folderPlus: (p) => svg(p, [h("path", { d: "M3 7.5H9.5L11.6 10.3H21V19.5A1.5 1.5 0 0 1 19.5 21H4.5A1.5 1.5 0 0 1 3 19.5Z", key: "a" }), h("line", { x1: 12, y1: 13.2, x2: 12, y2: 18, key: "b" }), h("line", { x1: 9.6, y1: 15.6, x2: 14.4, y2: 15.6, key: "c" })]),
  archive: (p) => svg(p, [h("rect", { x: 3, y: 4, width: 18, height: 4.5, key: "a" }), h("path", { d: "M5 8.5V19.5A1.5 1.5 0 0 0 6.5 21H17.5A1.5 1.5 0 0 0 19 19.5V8.5", key: "b" }), h("line", { x1: 10, y1: 12.5, x2: 14, y2: 12.5, key: "c" })]),
  clipboard: (p) => svg(p, [h("path", { d: "M8.5 5H6.5A1.5 1.5 0 0 0 5 6.5V19.5A1.5 1.5 0 0 0 6.5 21H17.5A1.5 1.5 0 0 0 19 19.5V6.5A1.5 1.5 0 0 0 17.5 5H15.5", key: "a" }), h("rect", { x: 8.5, y: 3, width: 7, height: 4, key: "b" })]),
  clipboardCheck: (p) => svg(p, [h("path", { d: "M8.5 5H6.5A1.5 1.5 0 0 0 5 6.5V19.5A1.5 1.5 0 0 0 6.5 21H17.5A1.5 1.5 0 0 0 19 19.5V6.5A1.5 1.5 0 0 0 17.5 5H15.5", key: "a" }), h("rect", { x: 8.5, y: 3, width: 7, height: 4, key: "b" }), h("polyline", { points: "8.7 13.6 11 15.53 15.5 11.75", key: "c" })]),
  attachment: (p) => svg(p, h("path", { d: "M17.5 10.8 10.4 17.4A3.6 3.6 0 0 1 5.4 12.2L13.1 5A2.5 2.5 0 0 1 16.6 8.6L9.4 15.3A1.4 1.4 0 0 1 7.5 13.3L13.8 7.5", key: "a" })),
  save: (p) => svg(p, [h("path", { d: "M4.5 4.5H16L19.5 8V19.5H4.5Z", key: "a" }), h("rect", { x: 8, y: 4.5, width: 8, height: 4.5, key: "b" }), h("rect", { x: 8, y: 13, width: 8, height: 6.5, key: "c" })]),
  duplicate: (p) => svg(p, [h("rect", { x: 8.5, y: 8.5, width: 12, height: 12, key: "a" }), h("path", { d: "M15.5 5.5H4.5A1 1 0 0 0 3.5 6.5V15.5", key: "b" })]),
  trash: (p) => svg(p, [h("line", { x1: 3.5, y1: 6.5, x2: 20.5, y2: 6.5, key: "a" }), h("path", { d: "M6.5 6.5V20A1 1 0 0 0 7.5 21H16.5A1 1 0 0 0 17.5 20V6.5", key: "b" }), h("path", { d: "M9 6.5V4.5A1 1 0 0 1 10 3.5H14A1 1 0 0 1 15 4.5V6.5", key: "c" }), h("line", { x1: 10.3, y1: 10.5, x2: 10.3, y2: 17.5, key: "d" }), h("line", { x1: 13.7, y1: 10.5, x2: 13.7, y2: 17.5, key: "e" })]),
  restore: (p) => svg(p, [h("path", { d: "M4.5 12A7.5 7.5 0 1 0 7 6.3", key: "a" }), h("polyline", { points: "3.5 3 3.5 7.3 7.8 7.3", key: "b" })]),
  bold: (p) => svg(p, [h("path", { d: "M7 4H13.5A4 4 0 0 1 13.5 12H7Z", key: "a" }), h("path", { d: "M7 12H14.5A4 4 0 0 1 14.5 20H7Z", key: "b" })]),
  italic: (p) => svg(p, [h("line", { x1: 10, y1: 4.5, x2: 18, y2: 4.5, key: "a" }), h("line", { x1: 6, y1: 19.5, x2: 14, y2: 19.5, key: "b" }), h("line", { x1: 14.3, y1: 4.5, x2: 9.7, y2: 19.5, key: "c" })]),
  underline: (p) => svg(p, [h("path", { d: "M7 4V12.5A5 5 0 0 0 17 12.5V4", key: "a" }), h("line", { x1: 5.5, y1: 20.5, x2: 18.5, y2: 20.5, key: "b" })]),
  strikethrough: (p) => svg(p, [h("path", { d: "M16 7.2A4 4 0 0 0 8.2 8.1C8.2 10.5 10.6 11.2 13 11.8", key: "a" }), h("path", { d: "M8 16.8A4 4 0 0 0 15.8 15.9C15.8 14.2 14.7 13.2 13 12.6", key: "b" }), h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12, key: "c" })]),
  list: (p) => svg(p, [h("line", { x1: 9, y1: 6.5, x2: 20.5, y2: 6.5, key: "a" }), h("line", { x1: 9, y1: 12, x2: 20.5, y2: 12, key: "b" }), h("line", { x1: 9, y1: 17.5, x2: 20.5, y2: 17.5, key: "c" }), h("rect", { x: 3.5, y: 5.5, width: 2, height: 2, key: "d" }), h("rect", { x: 3.5, y: 11, width: 2, height: 2, key: "e" }), h("rect", { x: 3.5, y: 16.5, width: 2, height: 2, key: "f" })]),
  listOrdered: (p) => svg(p, [h("line", { x1: 9.5, y1: 6.5, x2: 20.5, y2: 6.5, key: "a" }), h("line", { x1: 9.5, y1: 12, x2: 20.5, y2: 12, key: "b" }), h("line", { x1: 9.5, y1: 17.5, x2: 20.5, y2: 17.5, key: "c" }), h("polyline", { points: "3.5 5 5 4.4 5 8", key: "d" }), h("path", { d: "M3.5 10.5H6V13H3.5V15.5H6", key: "e" })]),
  indent: (p) => svg(p, [h("line", { x1: 10, y1: 6.5, x2: 20.5, y2: 6.5, key: "a" }), h("line", { x1: 10, y1: 12, x2: 20.5, y2: 12, key: "b" }), h("line", { x1: 10, y1: 17.5, x2: 20.5, y2: 17.5, key: "c" }), h("polyline", { points: "3.5 9 6.4 12 3.5 15", key: "d" })]),
  outdent: (p) => svg(p, [h("line", { x1: 10, y1: 6.5, x2: 20.5, y2: 6.5, key: "a" }), h("line", { x1: 10, y1: 12, x2: 20.5, y2: 12, key: "b" }), h("line", { x1: 10, y1: 17.5, x2: 20.5, y2: 17.5, key: "c" }), h("polyline", { points: "6.4 9 3.5 12 6.4 15", key: "d" })]),
  alignLeft: (p) => svg(p, [h("line", { x1: 3.5, y1: 6, x2: 20.5, y2: 6, key: "a" }), h("line", { x1: 3.5, y1: 12, x2: 14, y2: 12, key: "b" }), h("line", { x1: 3.5, y1: 18, x2: 17, y2: 18, key: "c" })]),
  alignCenter: (p) => svg(p, [h("line", { x1: 3.5, y1: 6, x2: 20.5, y2: 6, key: "a" }), h("line", { x1: 7, y1: 12, x2: 17, y2: 12, key: "b" }), h("line", { x1: 5, y1: 18, x2: 19, y2: 18, key: "c" })]),
  alignRight: (p) => svg(p, [h("line", { x1: 3.5, y1: 6, x2: 20.5, y2: 6, key: "a" }), h("line", { x1: 10, y1: 12, x2: 20.5, y2: 12, key: "b" }), h("line", { x1: 7, y1: 18, x2: 20.5, y2: 18, key: "c" })]),
  alignJustify: (p) => svg(p, [h("line", { x1: 3.5, y1: 6, x2: 20.5, y2: 6, key: "a" }), h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12, key: "b" }), h("line", { x1: 3.5, y1: 18, x2: 20.5, y2: 18, key: "c" })]),
  undo: (p) => svg(p, [h("path", { d: "M4 10.5H15A5 5 0 0 1 15 20.5H8", key: "a" }), h("polyline", { points: "7.6 6.4 3.5 10.5 7.6 14.6", key: "b" })]),
  redo: (p) => svg(p, [h("path", { d: "M20 10.5H9A5 5 0 0 0 9 20.5H16", key: "a" }), h("polyline", { points: "16.4 6.4 20.5 10.5 16.4 14.6", key: "b" })]),
  crop: (p) => svg(p, [h("line", { x1: 6.5, y1: 3, x2: 6.5, y2: 17.5, key: "a" }), h("line", { x1: 3, y1: 6.5, x2: 17.5, y2: 6.5, key: "b" }), h("polyline", { points: "6.5 17.5 17.5 17.5 17.5 6.5", key: "c" }), h("line", { x1: 17.5, y1: 17.5, x2: 17.5, y2: 21, key: "d" }), h("line", { x1: 21, y1: 17.5, x2: 17.5, y2: 17.5, key: "e" })]),
  door: (p) => svg(p, [h("path", { d: "M4.5 20.5 V6 L14 3.5 V20.5", key: "a" }), h("line", { x1: 3, y1: 20.5, x2: 21, y2: 20.5, key: "b" }), h("line", { x1: 16.5, y1: 13.5, x2: 21, y2: 9.72, key: "c" }), h("line", { x1: 16.5, y1: 17, x2: 21, y2: 13.22, key: "d" })]),
  threshold: (p) => svg(p, [h("line", { x1: 9.5, y1: 3, x2: 9.5, y2: 21, key: "a" }), h("line", { x1: 12, y1: 10, x2: 17, y2: 5.8, key: "b" }), h("line", { x1: 12, y1: 14, x2: 18, y2: 8.97, key: "c" }), h("line", { x1: 12, y1: 18, x2: 17, y2: 13.8, key: "d" })]),
  passport: (p) => svg(p, [h("path", { d: "M4.5 3 H17.5 A2 2 0 0 1 19.5 5 V19 A2 2 0 0 1 17.5 21 H6.5 A2 2 0 0 1 4.5 19 Z", key: "a" }), h("path", { d: "M9 9.5 A3 3 0 1 1 15 9.5 A3 3 0 1 1 9 9.5", key: "b" }), h("line", { x1: 8.5, y1: 15.5, x2: 15.5, y2: 15.5, key: "c" }), h("line", { x1: 8.5, y1: 18.2, x2: 13.2, y2: 18.2, key: "d" })]),
  check: (p) => svg(p, h("polyline", { points: "4.5 11.75 9.5 15.95 19.5 7.56", key: "a" })),
  minus: (p) => svg(p, h("line", { x1: 5, y1: 12, x2: 19, y2: 12, key: "a" })),
  plus: (p) => svg(p, [h("line", { x1: 12, y1: 5, x2: 12, y2: 19, key: "a" }), h("line", { x1: 5, y1: 12, x2: 19, y2: 12, key: "b" })]),
  close: (p) => svg(p, [h("line", { x1: 5.5, y1: 5.5, x2: 18.5, y2: 18.5, key: "a" }), h("line", { x1: 18.5, y1: 5.5, x2: 5.5, y2: 18.5, key: "b" })]),
  chevronDown: (p) => svg(p, h("polyline", { points: "7 9.9 12 14.1 17 9.9", key: "a" })),
  chevronUp: (p) => svg(p, h("polyline", { points: "7 14.1 12 9.9 17 14.1", key: "a" })),
  chevronLeft: (p) => svg(p, h("polyline", { points: "14.1 7 9.9 12 14.1 17", key: "a" })),
  chevronRight: (p) => svg(p, h("polyline", { points: "9.9 7 14.1 12 9.9 17", key: "a" })),
  arrowRight: (p) => svg(p, [h("line", { x1: 3.5, y1: 12, x2: 19.5, y2: 12, key: "a" }), h("polyline", { points: "15.1 8.31 19.5 12 15.1 15.69", key: "b" })]),
  arrowLeft: (p) => svg(p, [h("line", { x1: 20.5, y1: 12, x2: 4.5, y2: 12, key: "a" }), h("polyline", { points: "8.9 8.31 4.5 12 8.9 15.69", key: "b" })]),
  arrowUpRight: (p) => svg(p, [h("line", { x1: 5.2, y1: 17.6, x2: 18.2, y2: 6.69, key: "a" }), h("polyline", { points: "12.46 6.69 18.2 6.69 17.2 12.34", key: "b" })]),
  arrowDown: (p) => svg(p, [h("line", { x1: 12, y1: 3.5, x2: 12, y2: 19.5, key: "a" }), h("polyline", { points: "8.31 15.1 12 19.5 15.69 15.1", key: "b" })]),
  external: (p) => svg(p, [h("polyline", { points: "13.5 4.5 19.5 4.5 19.5 10.5", key: "a" }), h("line", { x1: 19.5, y1: 4.5, x2: 11, y2: 11.63, key: "b" }), h("path", { d: "M16 14.5V19.5H4.5V8H9.5", key: "c" })]),
  search: (p) => svg(p, [h("path", { d: "M12.84 16.02 A6 6 0 1 1 16.35 11.85", key: "a" }), h("line", { x1: 15.1, y1: 14.36, x2: 20.5, y2: 18.89, key: "b" })]),
  info: (p) => svg(p, [h("path", { d: "M20.89 10.59 A9 9 0 1 1 14.93 3.49", key: "a" }), h("rect", { x: 11, y: 7, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "b" }), h("line", { x1: 12, y1: 11, x2: 12, y2: 16.5, key: "c" })]),
  success: (p) => svg(p, [h("path", { d: "M20.89 10.59 A9 9 0 1 1 14.93 3.49", key: "a" }), h("polyline", { points: "8 12.65 10.8 15 16 10.64", key: "b" })]),
  warning: (p) => svg(p, [h("path", { d: "M12 3.5 21.5 20.5 H2.5 Z", key: "a" }), h("line", { x1: 12, y1: 10, x2: 12, y2: 14, key: "b" }), h("rect", { x: 11, y: 16, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" })]),
  danger: (p) => svg(p, [h("path", { d: "M20.89 10.59 A9 9 0 1 1 14.93 3.49", key: "a" }), h("line", { x1: 12, y1: 7, x2: 12, y2: 13, key: "b" }), h("rect", { x: 11, y: 15.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" })]),
  stop: (p) => svg(p, h("rect", { x: 6, y: 6, width: 12, height: 12, fill: "currentColor", stroke: "none", key: "a" })),
  sparkle: (p) => svg(p, [h("path", { d: "M12 3 L13.9 9.3 L20 12 L13.9 14.7 L12 21 L10.1 14.7 L4 12 L10.1 9.3 Z", key: "a" }), h("line", { x1: 18.5, y1: 4, x2: 20.5, y2: 4, key: "b" }), h("line", { x1: 19.5, y1: 3, x2: 19.5, y2: 5, key: "c" })]),
  tool: (p) => svg(p, [h("path", { d: "M3.5 5.5 H18.5 A2 2 0 0 1 20.5 7.5 V16.5 A2 2 0 0 1 18.5 18.5 H5.5 A2 2 0 0 1 3.5 16.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 9.5, x2: 20.5, y2: 9.5, key: "b" }), h("rect", { x: 5.3, y: 6.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" }), h("rect", { x: 8.1, y: 6.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "d" })]),
  shield: (p) => svg(p, h("path", { d: "M12 3 20 6 V12.5 C20 17 16.4 19.9 12 21.2 C7.6 19.9 4 17 4 12.5 V6 Z", key: "a" })),
  globe: (p) => svg(p, [h("path", { d: "M3 12 A9 9 0 1 1 21 12 A9 9 0 1 1 3 12", key: "a" }), h("line", { x1: 3, y1: 12, x2: 21, y2: 12, key: "b" }), h("path", { d: "M12 3C15.1 5.4 16.6 8.5 16.6 12C16.6 15.5 15.1 18.6 12 21C8.9 18.6 7.4 15.5 7.4 12C7.4 8.5 8.9 5.4 12 3Z", key: "c" })]),
  key: (p) => svg(p, [h("path", { d: "M9.38 11.91 A4.4 4.4 0 1 1 12.12 8.64", key: "a" }), h("line", { x1: 11.17, y1: 10.63, x2: 20.4, y2: 18.37, key: "b" }), h("line", { x1: 17.81, y1: 16.2, x2: 16.14, y2: 18.19, key: "c" }), h("line", { x1: 20.4, y1: 18.37, x2: 19.11, y2: 19.9, key: "d" })]),
  lock: (p) => svg(p, [h("path", { d: "M4.5 10.5 H17.5 A2 2 0 0 1 19.5 12.5 V18.5 A2 2 0 0 1 17.5 20.5 H6.5 A2 2 0 0 1 4.5 18.5 Z", key: "a" }), h("path", { d: "M8 10.5V7.8A4 4 0 0 1 16 7.8V10.5", key: "b" }), h("line", { x1: 12, y1: 14, x2: 12, y2: 17, key: "c" })]),
  unlock: (p) => svg(p, [h("path", { d: "M4.5 10.5 H17.5 A2 2 0 0 1 19.5 12.5 V18.5 A2 2 0 0 1 17.5 20.5 H6.5 A2 2 0 0 1 4.5 18.5 Z", key: "a" }), h("path", { d: "M8 10.5V7.8A4 4 0 0 1 16 7.8", key: "b" }), h("line", { x1: 12, y1: 14, x2: 12, y2: 17, key: "c" })]),
  user: (p) => svg(p, [h("path", { d: "M16.15 7.34 A4.2 4.2 0 1 1 13.37 4.03", key: "a" }), h("path", { d: "M4.5 20.5C4.5 16.9 7.9 14.5 12 14.5C16.1 14.5 19.5 16.9 19.5 20.5", key: "b" })]),
  users: (p) => svg(p, [h("path", { d: "M13.06 7.44 A3.6 3.6 0 1 1 10.67 4.6", key: "a" }), h("path", { d: "M3 20.5C3 17.4 5.9 15.2 9.5 15.2C13.1 15.2 16 17.4 16 20.5", key: "b" }), h("path", { d: "M16.2 5.2A3.6 3.6 0 0 1 16.2 11.9", key: "c" }), h("path", { d: "M17.4 15.6C19.6 16.4 21 18.3 21 20.5", key: "d" })]),
  ladder: (p) => svg(p, [h("line", { x1: 8, y1: 3, x2: 8, y2: 21, key: "a" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 21, key: "b" }), h("line", { x1: 8, y1: 7, x2: 16, y2: 7, key: "c" }), h("line", { x1: 8, y1: 12, x2: 16, y2: 12, key: "d" }), h("line", { x1: 8, y1: 17, x2: 16, y2: 17, key: "e" })]),
  spark: (p) => svg(p, h("path", { d: "M13.5 3 7 13.2 12 13.2 10.5 21 17 10.8 12 10.8 Z", key: "a" })),
  mail: (p) => svg(p, [h("path", { d: "M3 5 H19 A2 2 0 0 1 21 7 V17 A2 2 0 0 1 19 19 H5 A2 2 0 0 1 3 17 Z", key: "a" }), h("polyline", { points: "3 7.5 12 13.5 21 7.5", key: "b" })]),
  file: (p) => svg(p, [h("path", { d: "M5.5 3H14L19 7.2V21H5.5Z", key: "a" }), h("polyline", { points: "14 3 14 7.2 19 7.2", key: "b" }), h("line", { x1: 8.5, y1: 13, x2: 15.5, y2: 13, key: "c" }), h("line", { x1: 8.5, y1: 16.5, x2: 13.5, y2: 16.5, key: "d" })]),
  grid: (p) => svg(p, [h("path", { d: "M3.5 3.5 H9.0 A1.5 1.5 0 0 1 10.5 5.0 V9.0 A1.5 1.5 0 0 1 9.0 10.5 H5.0 A1.5 1.5 0 0 1 3.5 9.0 Z", key: "a" }), h("path", { d: "M13.5 3.5 H19.0 A1.5 1.5 0 0 1 20.5 5.0 V9.0 A1.5 1.5 0 0 1 19.0 10.5 H15.0 A1.5 1.5 0 0 1 13.5 9.0 Z", key: "b" }), h("path", { d: "M3.5 13.5 H9.0 A1.5 1.5 0 0 1 10.5 15.0 V19.0 A1.5 1.5 0 0 1 9.0 20.5 H5.0 A1.5 1.5 0 0 1 3.5 19.0 Z", key: "c" }), h("path", { d: "M13.5 13.5 H19.0 A1.5 1.5 0 0 1 20.5 15.0 V19.0 A1.5 1.5 0 0 1 19.0 20.5 H15.0 A1.5 1.5 0 0 1 13.5 19.0 Z", key: "d" })]),
  chart: (p) => svg(p, [h("line", { x1: 3.5, y1: 20.5, x2: 20.5, y2: 20.5, key: "a" }), h("line", { x1: 7, y1: 20.5, x2: 7, y2: 13, key: "b" }), h("line", { x1: 12, y1: 20.5, x2: 12, y2: 8.5, key: "c" }), h("line", { x1: 17, y1: 20.5, x2: 17, y2: 4, key: "d" })]),
  trend: (p) => svg(p, [h("line", { x1: 3.5, y1: 20.5, x2: 3.5, y2: 3.5, key: "a" }), h("line", { x1: 3.5, y1: 20.5, x2: 20.5, y2: 20.5, key: "b" }), h("polyline", { points: "6.5 16.6 11 12.4 14 13.41 18.6 7.15", key: "c" }), h("polyline", { points: "13.79 8.31 18.6 7.15 18.87 12.14", key: "d" })]),
  clock: (p) => svg(p, [h("path", { d: "M3 12 A9 9 0 1 1 21 12 A9 9 0 1 1 3 12", key: "a" }), h("polyline", { points: "12 6.2 12 12.4 16.6 14.6", key: "b" })]),
  calendar: (p) => svg(p, [h("path", { d: "M3.5 5 H18.5 A2 2 0 0 1 20.5 7 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 10, x2: 20.5, y2: 10, key: "b" }), h("line", { x1: 8, y1: 3, x2: 8, y2: 7, key: "c" }), h("line", { x1: 16, y1: 3, x2: 16, y2: 7, key: "d" }), h("rect", { x: 7.5, y: 13, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "e" }), h("rect", { x: 11, y: 13, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "f" })]),
  filter: (p) => svg(p, h("polyline", { points: "3.5 5.5 20.5 5.5 13.8 13.2 13.8 19.4 10.2 21 10.2 13.2 3.5 5.5", key: "a" })),
  sort: (p) => svg(p, [h("line", { x1: 4, y1: 6.5, x2: 20, y2: 6.5, key: "a" }), h("line", { x1: 4, y1: 12, x2: 14.5, y2: 12, key: "b" }), h("line", { x1: 4, y1: 17.5, x2: 9, y2: 17.5, key: "c" })]),
  link: (p) => svg(p, [h("path", { d: "M10.5 13.5A4.6 4.6 0 0 0 17 13.5L20 11A4.6 4.6 0 0 0 13.5 4L11.8 5.43", key: "a" }), h("path", { d: "M13.5 10.5A4.6 4.6 0 0 0 7 10.5L4 13A4.6 4.6 0 0 0 10.5 20L12.2 18.57", key: "b" })]),
  upload: (p) => svg(p, [h("line", { x1: 12, y1: 20, x2: 12, y2: 5, key: "a" }), h("polyline", { points: "8.31 9.4 12 5 15.69 9.4", key: "b" }), h("line", { x1: 3.5, y1: 20.5, x2: 20.5, y2: 20.5, key: "c" })]),
  download: (p) => svg(p, [h("line", { x1: 12, y1: 4, x2: 12, y2: 17, key: "a" }), h("polyline", { points: "8.31 12.6 12 17 15.69 12.6", key: "b" }), h("line", { x1: 3.5, y1: 20.5, x2: 20.5, y2: 20.5, key: "c" })]),
  send: (p) => svg(p, [h("path", { d: "M3 12 21 5.51 14.5 21 11.6 13.4 Z", key: "a" }), h("line", { x1: 11.6, y1: 13.4, x2: 21, y2: 5.51, key: "b" })]),
  refresh: (p) => svg(p, [h("path", { d: "M18.77 16.07 A7.9 7.9 0 1 1 18.77 7.93", key: "a" }), h("polyline", { points: "14.61 6.5 18.77 7.93 19.46 3.58", key: "b" })]),
  more: (p) => svg(p, [h("rect", { x: 5, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "a" }), h("rect", { x: 11, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "b" }), h("rect", { x: 17, y: 11, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "c" })]),
  menu: (p) => svg(p, [h("line", { x1: 3.5, y1: 7, x2: 20.5, y2: 7, key: "a" }), h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12, key: "b" }), h("line", { x1: 3.5, y1: 17, x2: 20.5, y2: 17, key: "c" })]),
  settings: (p) => svg(p, [h("line", { x1: 3.5, y1: 7.5, x2: 20.5, y2: 7.5, key: "a" }), h("line", { x1: 3.5, y1: 16.5, x2: 20.5, y2: 16.5, key: "b" }), h("path", { d: "M7 5.5 H10 A1 1 0 0 1 11 6.5 V8.5 A1 1 0 0 1 10 9.5 H8 A1 1 0 0 1 7 8.5 Z", key: "c" }), h("path", { d: "M13 14.5 H16 A1 1 0 0 1 17 15.5 V17.5 A1 1 0 0 1 16 18.5 H14 A1 1 0 0 1 13 17.5 Z", key: "d" })]),
  eye: (p) => svg(p, [h("path", { d: "M2.5 12C5 8 8.4 6 12 6C15.6 6 19 8 21.5 12C19 16 15.6 18 12 18C8.4 18 5 16 2.5 12Z", key: "a" }), h("path", { d: "M9 12 A3 3 0 1 1 15 12 A3 3 0 1 1 9 12", key: "b" })]),
  star: (p) => svg(p, h("path", { d: "M12 3.2 14.7 9.4 21.4 10.1 16.4 14.6 17.8 21.2 12 17.8 6.2 21.2 7.6 14.6 2.6 10.1 9.3 9.4 Z", key: "a" })),
  bookmark: (p) => svg(p, h("path", { d: "M6 3H18V21L12 15.97 6 21Z", key: "a" })),
  copy: (p) => svg(p, [h("path", { d: "M8 8 H18.5 A2 2 0 0 1 20.5 10 V18.5 A2 2 0 0 1 18.5 20.5 H10 A2 2 0 0 1 8 18.5 Z", key: "a" }), h("path", { d: "M16 8V4.5H3.5V17H7", key: "b" })]),
  edit: (p) => svg(p, [h("path", { d: "M 4.596 18.554 8.6434 17.8578 19.4876 8.7482 16.8208 5.5858 5.9766 14.6954 Z", key: "a" }), h("line", { x1: 13.7882, y1: 8.1346, x2: 16.455, y2: 11.297, key: "b" })]),
  play: (p) => svg(p, h("path", { d: "M 5.5 4.5 18.5 12 5.5 19.5 Z", key: "a" })),
  bridge: (p) => svg(p, [h("line", { x1: 3, y1: 7, x2: 21, y2: 7, key: "a" }), h("path", { d: "M 6.3 18 A 5.7 5.7 0 0 1 17.7 18", key: "b" }), h("line", { x1: 6.3, y1: 7, x2: 6.3, y2: 18, key: "c" }), h("line", { x1: 17.7, y1: 7, x2: 17.7, y2: 18, key: "d" })]),
  translate: (p) => svg(p, [h("polyline", { points: "3 17.5 6.9 7.5 10.8 17.5", key: "a" }), h("line", { x1: 4.7, y1: 13, x2: 9.1, y2: 13, key: "b" }), h("path", { d: "M 13.5 9 H 19.5 A 1.5 1.5 0 0 1 21 10.5 V 16.5 A 1.5 1.5 0 0 1 19.5 18 H 15 A 1.5 1.5 0 0 1 13.5 16.5 Z", key: "c" }), h("line", { x1: 15.55, y1: 12, x2: 19.35, y2: 12, key: "d" }), h("line", { x1: 15.55, y1: 15, x2: 19.35, y2: 15, key: "e" })]),
  beacon: (p) => svg(p, [h("path", { d: "M8.5 6.5 H14.5 A1 1 0 0 1 15.5 7.5 V10.5 A1 1 0 0 1 14.5 11.5 H9.5 A1 1 0 0 1 8.5 10.5 Z", key: "a" }), h("polyline", { points: "9.2 20.5 10.4 11.5 13.6 11.5 14.8 20.5", key: "b" }), h("line", { x1: 6, y1: 20.5, x2: 18, y2: 20.5, key: "c" }), h("line", { x1: 17.2, y1: 8, x2: 21, y2: 4.81, key: "d" }), h("line", { x1: 6.8, y1: 8, x2: 3, y2: 4.81, key: "e" })]),
  seal: (p) => svg(p, [h("path", { d: "M5 10.5 A7 7 0 1 1 19 10.5 A7 7 0 1 1 5 10.5", key: "a" }), h("polyline", { points: "8.8 10.8 11.1 12.73 15.2 9.29", key: "b" }), h("polyline", { points: "9.5 16.6 9.5 21.4 12 19.3 14.5 21.4 14.5 16.6", key: "c" })]),
  clause: (p) => svg(p, [h("path", { d: "M3.5 5 H6.5 A1 1 0 0 1 7.5 6 V8.5 A1 1 0 0 1 6.5 9.5 H4.5 A1 1 0 0 1 3.5 8.5 Z", key: "a" }), h("line", { x1: 10.5, y1: 7.25, x2: 20.5, y2: 7.25, key: "b" }), h("line", { x1: 3.5, y1: 13.5, x2: 20.5, y2: 13.5, key: "c" }), h("line", { x1: 3.5, y1: 17, x2: 20.5, y2: 17, key: "d" }), h("line", { x1: 3.5, y1: 20.5, x2: 15, y2: 20.5, key: "e" })]),
  highlight: (p) => svg(p, [h("line", { x1: 3.5, y1: 5.5, x2: 20.5, y2: 5.5, key: "a" }), h("path", { d: "M3.5 9 H13 A1 1 0 0 1 14 10 V13 A1 1 0 0 1 13 14 H4.5 A1 1 0 0 1 3.5 13 Z", key: "b" }), h("line", { x1: 3.5, y1: 18, x2: 20.5, y2: 18, key: "c" }), h("line", { x1: 3.5, y1: 21, x2: 14, y2: 21, key: "d" })]),
  redact: (p) => svg(p, [h("line", { x1: 3.5, y1: 5.5, x2: 20.5, y2: 5.5, key: "a" }), h("rect", { x: 3.5, y: 9, width: 10.5, height: 5, fill: "currentColor", stroke: "none", key: "b" }), h("line", { x1: 3.5, y1: 18, x2: 20.5, y2: 18, key: "c" }), h("line", { x1: 3.5, y1: 21, x2: 14, y2: 21, key: "d" })]),
  stack: (p) => svg(p, [h("path", { d: "M3.5 12.5 H14.5 A1.5 1.5 0 0 1 16 14 V19 A1.5 1.5 0 0 1 14.5 20.5 H5 A1.5 1.5 0 0 1 3.5 19 Z", key: "a" }), h("polyline", { points: "6.5 9.5 17.5 9.5 17.5 17.5", key: "b" }), h("polyline", { points: "9.5 6.5 20.5 6.5 20.5 14.5", key: "c" })]),
  columns: (p) => svg(p, [h("path", { d: "M3.5 4.5 H18.5 A2 2 0 0 1 20.5 6.5 V17.5 A2 2 0 0 1 18.5 19.5 H5.5 A2 2 0 0 1 3.5 17.5 Z", key: "a" }), h("line", { x1: 3.5, y1: 9, x2: 20.5, y2: 9, key: "b" }), h("line", { x1: 9.17, y1: 9, x2: 9.17, y2: 19.5, key: "c" }), h("line", { x1: 14.83, y1: 9, x2: 14.83, y2: 19.5, key: "d" })]),
  checklist: (p) => svg(p, [h("polyline", { points: "3.5 6.8 5.3 8.31 8.9 5.29", key: "a" }), h("line", { x1: 11.5, y1: 6.5, x2: 20.5, y2: 6.5, key: "b" }), h("polyline", { points: "3.5 12.8 5.3 14.31 8.9 11.29", key: "c" }), h("line", { x1: 11.5, y1: 12.5, x2: 20.5, y2: 12.5, key: "d" }), h("polyline", { points: "3.5 18.8 5.3 20.31 8.9 17.29", key: "e" }), h("line", { x1: 11.5, y1: 18.5, x2: 16.5, y2: 18.5, key: "f" })]),
  signature: (p) => svg(p, [h("path", { d: "M3 16.5 C6 3.5 9.4 3.2 10.2 11.5 C10.9 18.8 13 17.5 15.4 10 C16.8 5.6 19.4 8.4 20.5 13.5", key: "a" }), h("line", { x1: 3, y1: 20.5, x2: 21, y2: 20.5, key: "b" })]),
  scan: (p) => svg(p, [h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12, key: "z" }), h("polyline", { points: "3.5 8 3.5 4.5 7 4.5", key: "a" }), h("polyline", { points: "17 4.5 20.5 4.5 20.5 8", key: "b" }), h("polyline", { points: "20.5 16 20.5 19.5 17 19.5", key: "c" }), h("polyline", { points: "7 19.5 3.5 19.5 3.5 16", key: "d" }), h("line", { x1: 3.5, y1: 12, x2: 20.5, y2: 12, key: "e" })]),
  scales: (p) => svg(p, [h("line", { x1: 6, y1: 7, x2: 18, y2: 7, key: "a" }), h("line", { x1: 12, y1: 4.5, x2: 12, y2: 20, key: "b" }), h("line", { x1: 9, y1: 20, x2: 15, y2: 20, key: "c" }), h("path", { d: "M6 7 V9.8 M3 9.8 H9 L6 14.4 Z", key: "d" }), h("path", { d: "M18 7 V9.8 M15 9.8 H21 L18 14.4 Z", key: "e" })]),
  flag: (p) => svg(p, [h("line", { x1: 5.5, y1: 3, x2: 5.5, y2: 21, key: "a" }), h("path", { d: "M5.5 4.5 H19 L15.5 7.44 19 10.38 H5.5 Z", key: "b" })]),
  compare: (p) => svg(p, [h("path", { d: "M3 5 H8.5 A1.5 1.5 0 0 1 10 6.5 V17.5 A1.5 1.5 0 0 1 8.5 19 H4.5 A1.5 1.5 0 0 1 3 17.5 Z", key: "a" }), h("path", { d: "M14 5 H19.5 A1.5 1.5 0 0 1 21 6.5 V17.5 A1.5 1.5 0 0 1 19.5 19 H15.5 A1.5 1.5 0 0 1 14 17.5 Z", key: "b" }), h("line", { x1: 5, y1: 9.5, x2: 8, y2: 9.5, key: "c" }), h("line", { x1: 16, y1: 9.5, x2: 19, y2: 9.5, key: "d" }), h("line", { x1: 16, y1: 13.5, x2: 19, y2: 13.5, key: "e" })]),
  route: (p) => svg(p, [h("rect", { x: 3, y: 19, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "a" }), h("polyline", { points: "5.5 20 9.5 20 9.5 13 15 13 15 6 20.5 6", key: "b" })]),
  history: (p) => svg(p, [h("path", { d: "M5.23 16.07 A7.9 7.9 0 1 0 5.23 7.93", key: "a" }), h("polyline", { points: "9.39 6.5 5.23 7.93 4.54 3.58", key: "b" }), h("polyline", { points: "12 7 12 12.4 16.3 14.6", key: "c" })]),
  branch: (p) => svg(p, [h("line", { x1: 6.5, y1: 6, x2: 6.5, y2: 18, key: "a" }), h("path", { d: "M6.5 9 H14 A3 3 0 0 1 17 12 V15", key: "b" }), h("rect", { x: 5, y: 3, width: 3, height: 3, fill: "currentColor", stroke: "none", key: "c" }), h("rect", { x: 5, y: 18, width: 3, height: 3, fill: "currentColor", stroke: "none", key: "d" }), h("rect", { x: 15.5, y: 15, width: 3, height: 3, fill: "currentColor", stroke: "none", key: "e" })]),
  briefcase: (p) => svg(p, [h("path", { d: "M3.5 8 H18.5 A2 2 0 0 1 20.5 10 V18.5 A2 2 0 0 1 18.5 20.5 H5.5 A2 2 0 0 1 3.5 18.5 Z", key: "a" }), h("path", { d: "M9 8 V5.5 A1.5 1.5 0 0 1 10.5 4 H13.5 A1.5 1.5 0 0 1 15 5.5 V8", key: "b" }), h("line", { x1: 3.5, y1: 13, x2: 20.5, y2: 13, key: "c" })]),
  building: (p) => svg(p, [h("polyline", { points: "4 20.5 4 4 14 4 14 20.5", key: "a" }), h("polyline", { points: "14 9.5 20.5 9.5 20.5 20.5", key: "b" }), h("line", { x1: 2.5, y1: 20.5, x2: 21.5, y2: 20.5, key: "c" }), h("rect", { x: 6.5, y: 7.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "d" }), h("rect", { x: 10, y: 7.5, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "e" }), h("rect", { x: 6.5, y: 13, width: 2, height: 2, fill: "currentColor", stroke: "none", key: "f" })]),
  graduation: (p) => svg(p, [h("path", { d: "M2.5 9.5 12 5.5 21.5 9.5 12 13.5 Z", key: "a" }), h("path", { d: "M6.5 11.2 V16.6 C6.5 16.6 8.8 18.6 12 18.6 C15.2 18.6 17.5 16.6 17.5 16.6 V11.2", key: "b" }), h("line", { x1: 20.6, y1: 10.2, x2: 20.6, y2: 15.8, key: "c" })]),
  network: (p) => svg(p, [h("path", { d: "M10 3.5 H13 A1 1 0 0 1 14 4.5 V7 A1 1 0 0 1 13 8 H11 A1 1 0 0 1 10 7 Z", key: "a" }), h("path", { d: "M3 15.5 H6 A1 1 0 0 1 7 16.5 V19 A1 1 0 0 1 6 20 H4 A1 1 0 0 1 3 19 Z", key: "b" }), h("path", { d: "M17 15.5 H20 A1 1 0 0 1 21 16.5 V19 A1 1 0 0 1 20 20 H18 A1 1 0 0 1 17 19 Z", key: "c" }), h("line", { x1: 10.6, y1: 8.6, x2: 5.2, y2: 15, key: "d" }), h("line", { x1: 13.4, y1: 8.6, x2: 18.8, y2: 15, key: "e" })]),
  pin: (p) => svg(p, [h("path", { d: "M5.5 9.5 A6.5 6.5 0 1 1 18.5 9.5 C18.5 14.5 12 21 12 21 C12 21 5.5 14.5 5.5 9.5 Z", key: "a" }), h("path", { d: "M9.5 9.5 A2.5 2.5 0 1 1 14.5 9.5 A2.5 2.5 0 1 1 9.5 9.5", key: "b" })]),
  anonymous: (p) => svg(p, [h("path", { d: "M16.15 7.34 A4.2 4.2 0 1 1 13.37 4.03", key: "a" }), h("path", { d: "M4.5 20.5C4.5 16.9 7.9 14.5 12 14.5C16.1 14.5 19.5 16.9 19.5 20.5", key: "b" }), h("rect", { x: 7.8, y: 6.9, width: 8.4, height: 2.4, fill: "currentColor", stroke: "none", key: "c" })])
};
var iconNames = Object.keys(icons);

// node_modules/@redrob-labs/ui/dist/esm/internal/cx.js
function cx(...parts) {
  const out = [];
  for (const part of parts) {
    if (!part)
      continue;
    if (typeof part === "string") {
      out.push(part);
    } else {
      for (const key of Object.keys(part)) {
        if (part[key])
          out.push(key);
      }
    }
  }
  return out.join(" ");
}

// node_modules/@redrob-labs/ui/dist/esm/internal/ids.js
var React2 = __toESM(require_react(), 1);
var counter = 0;
function nextId(prefix) {
  counter += 1;
  return `${prefix}-${counter}`;
}
function useStableId(prefix) {
  const ref = React2.useRef(null);
  if (ref.current === null)
    ref.current = nextId(prefix);
  return ref.current;
}

// node_modules/@redrob-labs/ui/dist/esm/components/SectionMark/SectionMark.js
var React3 = __toESM(require_react(), 1);
function SectionMark(props) {
  return React3.createElement("div", {
    className: cx("rr-section-mark", props.className),
    role: props.as === "heading" ? "heading" : void 0,
    "aria-level": props.as === "heading" ? props.level || 2 : void 0
  }, [
    React3.createElement("span", {
      className: cx("rr-tick", props.tone === "muted" && "rr-tick--muted"),
      key: "t",
      "aria-hidden": "true"
    }),
    React3.createElement("span", { key: "l" }, Array.isArray(props.label) ? props.label.join(" · ") : props.label),
    props.trailing ? React3.createElement("span", { key: "r", style: { flex: "none", color: "var(--ink-muted)" } }, props.trailing) : null
  ]);
}

// node_modules/@redrob-labs/ui/dist/esm/components/Button/Button.js
var React4 = __toESM(require_react(), 1);

// node_modules/@redrob-labs/ui/dist/esm/internal/omit.js
function omit(props, keys) {
  const out = {};
  for (const key of Object.keys(props)) {
    if (keys.indexOf(key) === -1) {
      out[key] = props[key];
    }
  }
  return out;
}

// node_modules/@redrob-labs/ui/dist/esm/components/Button/Button.js
function Button(props) {
  const variant = props.variant || "primary";
  const size = props.size || "md";
  const rest = omit(props, [
    "variant",
    "size",
    "iconLeft",
    "iconRight",
    "fullWidth",
    "loading",
    "shape",
    "emphasis",
    "className",
    "children"
  ]);
  const kids = [];
  if (props.loading) {
    kids.push(React4.createElement("span", { className: "rr-spinner", key: "spin" }));
  } else if (props.iconLeft) {
    kids.push(React4.createElement("span", { className: "rr-btn__icon", key: "il" }, props.iconLeft));
  }
  kids.push(React4.createElement("span", { key: "label" }, props.children));
  if (props.iconRight && !props.loading) {
    kids.push(React4.createElement("span", { className: "rr-btn__icon", key: "ir" }, props.iconRight));
  }
  return React4.createElement("button", Object.assign({ type: props.type || "button", className: cx("rr-btn", `rr-btn--${variant}`, `rr-btn--${size}`, props.shape === "pill" && "rr-btn--pill", props.emphasis && "rr-btn--emphasis", props.fullWidth && "rr-btn--block", props.className), disabled: props.disabled || props.loading, "aria-busy": props.loading ? "true" : void 0 }, rest), kids);
}

// node_modules/@redrob-labs/ui/dist/esm/components/IconButton/IconButton.js
var React5 = __toESM(require_react(), 1);
function IconButton(props) {
  const variant = props.variant || "ghost";
  const size = props.size || "md";
  const rest = omit(props, ["variant", "size", "round", "label", "className", "children"]);
  return React5.createElement("button", Object.assign({ type: props.type || "button", "aria-label": props.label, title: props.label, className: cx("rr-iconbtn", `rr-iconbtn--${variant}`, `rr-iconbtn--${size}`, props.round && "rr-iconbtn--round", props.className) }, rest), React5.createElement("span", { className: "rr-btn__icon", style: { fontSize: size === "sm" ? "14px" : "18px" } }, props.children));
}

// node_modules/@redrob-labs/ui/dist/esm/components/Menu/Menu.js
var React7 = __toESM(require_react(), 1);

// node_modules/@redrob-labs/ui/dist/esm/internal/useDismiss.js
var React6 = __toESM(require_react(), 1);
function useDismiss(open, close) {
  const ref = React6.useRef(null);
  React6.useEffect(() => {
    if (!open)
      return void 0;
    function onDown(event) {
      if (ref.current && !ref.current.contains(event.target))
        close();
    }
    function onKey(event) {
      if (event.key === "Escape")
        close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

// node_modules/@redrob-labs/ui/dist/esm/components/Menu/Menu.js
function Menu(props) {
  const items = props.items || [];
  const [open, setOpen] = React7.useState(!!props.defaultOpen);
  const close = React7.useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const actionable = items.filter((item) => item.type !== "separator" && !item.disabled);
  function onKeyDown(event) {
    if (!open)
      return;
    const nodes = ref.current ? ref.current.querySelectorAll('[role="menuitem"]:not([disabled])') : [];
    if (!nodes.length)
      return;
    const index = Array.prototype.indexOf.call(nodes, document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      nodes[(index + 1) % nodes.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nodes[(index - 1 + nodes.length) % nodes.length].focus();
    }
  }
  const trigger = React7.createElement("button", {
    type: "button",
    key: "trigger",
    className: cx("rr-btn", `rr-btn--${props.variant || "secondary"}`, `rr-btn--${props.size || "md"}`),
    "aria-haspopup": "menu",
    "aria-expanded": String(open),
    onClick: () => setOpen(!open)
  }, [
    React7.createElement("span", { key: "l" }, props.label),
    React7.createElement("span", { key: "c", className: "rr-btn__icon" }, icons.chevronDown({ width: 16, height: 16 }))
  ]);
  const list = open ? React7.createElement("div", {
    key: "list",
    className: cx("rr-menu__list", props.align === "right" && "rr-menu__list--right"),
    role: "menu",
    "aria-label": props.label
  }, items.map((item, i) => {
    if (item.type === "separator") {
      return React7.createElement("div", {
        key: `s${i}`,
        className: "rr-menu__sep",
        role: "separator"
      });
    }
    return React7.createElement("button", {
      type: "button",
      key: item.id || i,
      role: "menuitem",
      className: cx("rr-menu__item", item.tone === "danger" && "rr-menu__item--danger"),
      disabled: item.disabled,
      onClick: () => {
        if (item.onSelect)
          item.onSelect(item);
        if (props.onSelect)
          props.onSelect(item);
        setOpen(false);
      }
    }, [
      item.icon ? React7.createElement("span", { key: "i", className: "rr-menu__icon" }, item.icon) : null,
      React7.createElement("span", { key: "l", className: "rr-menu__label" }, item.label),
      item.shortcut ? React7.createElement("span", { key: "k", className: "rr-menu__shortcut" }, item.shortcut) : null
    ]);
  })) : null;
  return React7.createElement("div", { className: cx("rr-menu", props.className), ref, onKeyDown }, [
    trigger,
    list,
    actionable.length === 0 && open ? React7.createElement("span", { key: "empty" }) : null
  ]);
}

// node_modules/@redrob-labs/ui/dist/esm/components/Input/Input.js
var React9 = __toESM(require_react(), 1);

// node_modules/@redrob-labs/ui/dist/esm/internal/Field.js
var React8 = __toESM(require_react(), 1);
function Field(props, control) {
  const kids = [];
  if (props.label) {
    kids.push(React8.createElement("label", { className: "rr-field__label", htmlFor: props.id, key: "l" }, [
      props.label,
      props.required ? React8.createElement("span", { className: "rr-field__req", key: "r", "aria-hidden": "true" }, "*") : null
    ]));
  }
  kids.push(React8.createElement("div", { key: "c" }, control));
  if (props.error) {
    kids.push(React8.createElement("p", { className: "rr-field__error", id: `${props.id}-msg`, key: "e" }, props.error));
  } else if (props.hint) {
    kids.push(React8.createElement("p", { className: "rr-field__hint", id: `${props.id}-msg`, key: "h" }, props.hint));
  }
  return React8.createElement("div", { className: cx("rr-field", props.className), style: props.style }, kids);
}

// node_modules/@redrob-labs/ui/dist/esm/components/Input/Input.js
function Input(props) {
  const autoId = useStableId("rr-input");
  const id = props.id || autoId;
  const size = props.size || "md";
  const rest = omit(props, ["label", "hint", "error", "size", "className", "style", "id", "invalid"]);
  const invalid = props.invalid || !!props.error;
  const control = React9.createElement("input", Object.assign({ id, className: cx("rr-control", `rr-control--${size}`), "aria-invalid": invalid ? "true" : void 0, "aria-describedby": props.error || props.hint ? `${id}-msg` : void 0 }, rest));
  return Field(Object.assign(Object.assign({}, props), { id }), control);
}

// node_modules/@redrob-labs/ui/dist/esm/components/Select/Select.js
var React10 = __toESM(require_react(), 1);
function Select(props) {
  const autoId = useStableId("rr-select");
  const id = props.id || autoId;
  const size = props.size || "md";
  const invalid = props.invalid || !!props.error;
  const options = (props.options || []).map((o) => typeof o === "string" ? { value: o, label: o } : o);
  const controlled = props.value !== void 0;
  const [inner, setInner] = React10.useState(props.defaultValue !== void 0 ? props.defaultValue : props.placeholder ? "" : options[0] && options[0].value);
  const value = controlled ? props.value : inner;
  const [open, setOpen] = React10.useState(false);
  const [active, setActive] = React10.useState(-1);
  const [up, setUp] = React10.useState(false);
  const wrap = React10.useRef(null);
  const list = React10.useRef(null);
  const btn = React10.useRef(null);
  const typed = React10.useRef({ s: "", t: 0 });
  const listId = `${id}-list`;
  const current = options.filter((o) => String(o.value) === String(value))[0];
  const enabled = (i) => !!options[i] && !options[i].disabled;
  function step(from, dir) {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir)
      if (enabled(i))
        return i;
    return from;
  }
  function show() {
    if (props.disabled)
      return;
    const i = options.indexOf(current);
    setActive(i >= 0 ? i : step(-1, 1));
    const rect = wrap.current && wrap.current.getBoundingClientRect();
    setUp(!!rect && window.innerHeight - rect.bottom < 280 && rect.top > window.innerHeight - rect.bottom);
    setOpen(true);
  }
  function choose(i) {
    if (!enabled(i))
      return;
    const option = options[i];
    setOpen(false);
    if (btn.current)
      btn.current.focus();
    if (String(option.value) === String(value))
      return;
    if (!controlled)
      setInner(option.value);
    if (props.onChange) {
      const target = { value: String(option.value), name: props.name, id };
      props.onChange({ target, currentTarget: target, type: "change", preventDefault: () => {
      }, stopPropagation: () => {
      } }, option);
    }
  }
  React10.useEffect(() => {
    if (!open)
      return void 0;
    function away(event) {
      if (wrap.current && !wrap.current.contains(event.target))
        setOpen(false);
    }
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  React10.useEffect(() => {
    if (!open || !list.current || active < 0)
      return;
    const el = list.current.children[active];
    if (el && el.scrollIntoView)
      el.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function onKey(event) {
    const k = event.key;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") {
        event.preventDefault();
        show();
      }
      return;
    }
    if (k === "ArrowDown") {
      event.preventDefault();
      setActive(step(active, 1));
    } else if (k === "ArrowUp") {
      event.preventDefault();
      setActive(step(active, -1));
    } else if (k === "Home") {
      event.preventDefault();
      setActive(step(-1, 1));
    } else if (k === "End") {
      event.preventDefault();
      setActive(step(options.length, -1));
    } else if (k === "Enter" || k === " ") {
      event.preventDefault();
      choose(active);
    } else if (k === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (k === "Tab") {
      setOpen(false);
    } else if (k.length === 1) {
      const now = Date.now();
      const t = typed.current;
      t.s = (now - t.t > 700 ? "" : t.s) + k.toLowerCase();
      t.t = now;
      for (let i = 0; i < options.length; i++) {
        let n = (active + 1 + i) % options.length;
        if (t.s.length > 1)
          n = i;
        if (enabled(n) && String(options[n].label).toLowerCase().indexOf(t.s) === 0) {
          setActive(n);
          break;
        }
      }
    }
  }
  if (props.native) {
    const rest = omit(props, [
      "label",
      "hint",
      "error",
      "size",
      "className",
      "style",
      "id",
      "invalid",
      "options",
      "placeholder",
      "native"
    ]);
    const opts = options.map((o, i) => React10.createElement("option", { value: o.value, key: `o${i}`, disabled: o.disabled }, o.label));
    if (props.placeholder) {
      opts.unshift(React10.createElement("option", { value: "", key: "ph", disabled: true }, props.placeholder));
      if (props.value === void 0 && props.defaultValue === void 0)
        rest.defaultValue = "";
    }
    return Field(Object.assign(Object.assign({}, props), { id }), React10.createElement("span", { className: "rr-select-wrap" }, [
      React10.createElement("select", Object.assign({ id, key: "s", className: cx("rr-control", `rr-control--${size}`, "rr-select"), "aria-invalid": invalid ? "true" : void 0, "aria-describedby": props.error || props.hint ? `${id}-msg` : void 0 }, rest), opts),
      React10.createElement("span", { className: "rr-select-wrap__caret", key: "c" }, icons.chevronDown({ width: "100%", height: "100%" }))
    ]));
  }
  const control = React10.createElement("span", {
    className: cx("rr-select-wrap", "rr-select-wrap--list", open && "rr-select-wrap--open"),
    ref: wrap
  }, [
    React10.createElement("button", {
      key: "b",
      ref: btn,
      type: "button",
      id,
      role: "combobox",
      disabled: props.disabled,
      className: cx("rr-control", `rr-control--${size}`, "rr-select", "rr-select__button", !current && "rr-select__button--empty"),
      "aria-haspopup": "listbox",
      "aria-expanded": open ? "true" : "false",
      "aria-controls": listId,
      "aria-activedescendant": open && active >= 0 ? `${id}-o${active}` : void 0,
      "aria-invalid": invalid ? "true" : void 0,
      "aria-describedby": props.error || props.hint ? `${id}-msg` : void 0,
      onClick: () => open ? setOpen(false) : show(),
      onKeyDown: onKey
    }, React10.createElement("span", { className: "rr-select__value" }, current ? current.label : props.placeholder || "")),
    React10.createElement("span", { className: "rr-select-wrap__caret", key: "c", "aria-hidden": "true" }, icons.chevronDown({ width: "100%", height: "100%" })),
    props.name ? React10.createElement("input", {
      key: "n",
      type: "hidden",
      name: props.name,
      value: value == null ? "" : value
    }) : null,
    React10.createElement("ul", {
      key: "l",
      ref: list,
      id: listId,
      role: "listbox",
      tabIndex: -1,
      hidden: !open,
      "aria-labelledby": id,
      className: cx("rr-select__list", `rr-select__list--${size}`, up && "rr-select__list--up")
    }, options.map((o, i) => {
      const selected = current === o;
      return React10.createElement("li", {
        key: `o${i}`,
        id: `${id}-o${i}`,
        role: "option",
        "aria-selected": selected ? "true" : "false",
        "aria-disabled": o.disabled ? "true" : void 0,
        className: cx("rr-select__option", i === active && "rr-select__option--active"),
        onPointerMove: () => {
          if (i !== active && enabled(i))
            setActive(i);
        },
        onMouseDown: (event) => event.preventDefault(),
        onClick: () => choose(i)
      }, [
        React10.createElement("span", { key: "t", className: "rr-select__otext" }, [
          React10.createElement("span", { key: "l", className: "rr-select__olabel" }, o.label),
          o.detail ? React10.createElement("span", { key: "d", className: "rr-select__odetail" }, o.detail) : null
        ]),
        React10.createElement("span", { key: "c", className: "rr-select__check", "aria-hidden": "true" }, selected ? icons.check({ width: 16, height: 16 }) : null)
      ]);
    }))
  ]);
  return Field(Object.assign(Object.assign({}, props), { id }), control);
}

// node_modules/@redrob-labs/ui/dist/esm/components/Radio/Radio.js
var React11 = __toESM(require_react(), 1);
function Radio(props) {
  const rest = omit(props, ["label", "hint", "className", "children"]);
  return React11.createElement("label", {
    className: cx("rr-choice", props.disabled && "rr-choice--disabled", props.className),
    style: { position: "relative" }
  }, [
    React11.createElement("input", Object.assign({ type: "radio", className: "rr-choice__input", key: "i" }, rest)),
    React11.createElement("span", { className: "rr-choice__box rr-choice__box--radio", key: "b" }, React11.createElement("span", { className: "rr-choice__dot" })),
    React11.createElement("span", { className: "rr-choice__text", key: "t" }, [
      React11.createElement("span", { key: "l" }, props.label || props.children),
      props.hint ? React11.createElement("span", { className: "rr-choice__hint", key: "h" }, props.hint) : null
    ])
  ]);
}

// node_modules/@redrob-labs/ui/dist/esm/components/Accordion/Accordion.js
var React12 = __toESM(require_react(), 1);
function Accordion(props) {
  const items = props.items || [];
  const multiple = !!props.multiple;
  const initial = props.defaultOpen != null ? [].concat(props.defaultOpen) : [];
  const [open, setOpen] = React12.useState(initial);
  function toggle(id) {
    setOpen((cur) => {
      const isOpen = cur.indexOf(id) !== -1;
      if (isOpen)
        return cur.filter((x2) => x2 !== id);
      return multiple ? cur.concat([id]) : [id];
    });
  }
  return React12.createElement("div", { className: cx("rr-accordion", props.className) }, items.map((item) => {
    const isOpen = open.indexOf(item.id) !== -1;
    return React12.createElement("div", { className: "rr-accordion__item", key: item.id }, [
      React12.createElement("button", {
        type: "button",
        key: "h",
        className: "rr-accordion__trigger",
        "aria-expanded": String(isOpen),
        "aria-controls": `acc-panel-${item.id}`,
        id: `acc-trigger-${item.id}`,
        disabled: item.disabled,
        onClick: () => toggle(item.id)
      }, [
        React12.createElement("span", { key: "t", className: "rr-accordion__label" }, item.title),
        item.meta ? React12.createElement("span", { key: "m", className: "rr-accordion__meta" }, item.meta) : null,
        React12.createElement("span", {
          key: "c",
          className: cx("rr-accordion__chevron", isOpen && "rr-accordion__chevron--open")
        }, icons.chevronDown({ width: 16, height: 16 }))
      ]),
      React12.createElement("div", {
        key: "p",
        id: `acc-panel-${item.id}`,
        role: "region",
        "aria-labelledby": `acc-trigger-${item.id}`,
        className: "rr-accordion__panel",
        hidden: !isOpen
      }, item.content)
    ]);
  }));
}

// node_modules/@redrob-labs/ui/dist/esm/components/Alert/Alert.js
var React13 = __toESM(require_react(), 1);

// node_modules/@redrob-labs/ui/dist/esm/internal/tone.js
var TONE_ICON = {
  info: icons.info,
  success: icons.success,
  warning: icons.warning,
  danger: icons.danger
};

// node_modules/@redrob-labs/ui/dist/esm/components/Alert/Alert.js
function Alert(props) {
  const tone = props.tone || "info";
  const Icon = TONE_ICON[tone] || icons.info;
  return React13.createElement("div", {
    className: cx("rr-alert", `rr-alert--${tone}`, props.className),
    role: tone === "danger" ? "alert" : "status"
  }, [
    React13.createElement("span", { className: "rr-alert__icon", key: "i" }, Icon({ width: "100%", height: "100%" })),
    React13.createElement("div", { className: "rr-alert__body", key: "b" }, [
      props.title ? React13.createElement("div", { className: "rr-alert__title", key: "t" }, props.title) : null,
      props.children ? React13.createElement("div", { className: "rr-alert__text", key: "x" }, props.children) : null,
      props.action ? React13.createElement("div", { key: "a", style: { marginTop: "4px" } }, props.action) : null
    ]),
    props.onClose ? React13.createElement(IconButton, { key: "c", label: props.closeLabel || "Dismiss", size: "sm", onClick: props.onClose }, icons.close({ width: "100%", height: "100%" })) : null
  ]);
}

// node_modules/@redrob-labs/ui/dist/esm/components/Composer/Composer.js
var React14 = __toESM(require_react(), 1);
function Composer(props) {
  const [held, setHeld] = React14.useState(props.defaultValue || "");
  const value = props.value !== void 0 ? props.value : held;
  const taRef = React14.useRef(null);
  const id = React14.useRef(nextId("rr-composer")).current;
  const maxRows = props.maxRows || 8;
  React14.useEffect(() => {
    const ta = taRef.current;
    if (!ta)
      return;
    ta.style.height = "auto";
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    ta.style.height = `${Math.min(ta.scrollHeight, lh * maxRows)}px`;
  }, [value, maxRows]);
  function set(v2) {
    if (props.value === void 0)
      setHeld(v2);
    if (props.onChange)
      props.onChange(v2);
  }
  function submit() {
    if (props.busy || props.disabled || !String(value).trim())
      return;
    if (props.onSubmit)
      props.onSubmit(value);
    if (props.value === void 0)
      setHeld("");
  }
  const empty = !String(value).trim();
  const form = React14.createElement("form", {
    className: cx("rr-composer", props.busy && "rr-composer--busy", props.className),
    onSubmit: (event) => {
      event.preventDefault();
      submit();
    }
  }, [
    props.context ? React14.createElement("div", { key: "x", className: "rr-composer__context" }, props.context) : null,
    React14.createElement("label", { key: "l", htmlFor: id, className: "rr-visually-hidden" }, props.label || "Message"),
    React14.createElement("textarea", {
      key: "t",
      id,
      ref: taRef,
      rows: 1,
      className: "rr-composer__input",
      placeholder: props.placeholder,
      value,
      disabled: props.disabled,
      onChange: (event) => set(event.target.value),
      onKeyDown: (event) => {
        const native = event.nativeEvent;
        if (event.key === "Enter" && !event.shiftKey && !(native && native.isComposing) && event.keyCode !== 229) {
          event.preventDefault();
          submit();
        }
      }
    }),
    React14.createElement("div", { key: "b", className: "rr-composer__bar" }, [
      React14.createElement("div", { key: "a", className: "rr-composer__lead" }, props.leading !== void 0 ? props.leading : React14.createElement("button", {
        type: "button",
        className: "rr-composer__tool",
        "aria-label": props.addLabel || "Add files",
        onClick: props.onAdd
      }, icons.plus({ width: 18, height: 18 }))),
      React14.createElement("div", { key: "r", className: "rr-composer__trail" }, [
        props.tools ? React14.createElement("span", { key: "m", className: "rr-composer__tools" }, props.tools) : null,
        props.busy ? React14.createElement("button", {
          key: "s",
          type: "button",
          className: "rr-composer__send rr-composer__send--stop",
          "aria-label": props.stopLabel || "Stop",
          onClick: props.onStop
        }, icons.stop({ width: 14, height: 14 })) : React14.createElement("button", {
          key: "s",
          type: "submit",
          className: "rr-composer__send",
          "aria-label": props.submitLabel || "Send",
          disabled: empty || props.disabled
        }, icons.arrowUp({ width: 18, height: 18 }))
      ])
    ])
  ]);
  if (!props.status)
    return form;
  return React14.createElement("div", { className: "rr-composer-group" }, [
    React14.createElement(React14.Fragment, { key: "f" }, form),
    React14.createElement("div", { key: "s", className: "rr-composer-group__status" }, props.status)
  ]);
}

// node_modules/@redrob-labs/ui/dist/esm/components/ComposerStatus/ComposerStatus.js
var React16 = __toESM(require_react(), 1);

// node_modules/@redrob-labs/ui/dist/esm/internal/StatusBars.js
var React15 = __toESM(require_react(), 1);
function StatusBars(props) {
  const n = props.n || 0;
  const of = props.of || 3;
  const bars = [];
  for (let i = 0; i < of; i++)
    bars.push(React15.createElement("i", { key: i, "data-on": String(i < n) }));
  return React15.createElement("span", {
    className: cx("rr-bars", props.tone && `rr-bars--${props.tone}`, props.className),
    "aria-hidden": "true"
  }, bars);
}

// node_modules/@redrob-labs/ui/dist/esm/components/ComposerStatus/ComposerStatus.js
function ComposerStatus(props) {
  const items = (props.items || []).filter(Boolean);
  const [held, setHeld] = React16.useState(props.defaultOpen || null);
  const open = props.open !== void 0 ? props.open : held;
  function set(v2) {
    if (props.open === void 0)
      setHeld(v2);
    if (props.onOpenChange)
      props.onOpenChange(v2);
  }
  const close = React16.useCallback(() => set(null), [props.open]);
  const ref = useDismiss(!!open, close);
  const cur = items.filter((x2) => x2.id === open)[0];
  return React16.createElement("div", {
    className: cx("rr-cstatus", props.className),
    ref,
    role: "group",
    "aria-label": props.label || "How this chat is handled"
  }, [
    React16.createElement("div", { key: "r", className: "rr-cstatus__row" }, items.map((x2) => React16.createElement("button", {
      key: x2.id,
      type: "button",
      className: cx("rr-cstatus__item", `rr-cstatus__item--${x2.tone || "plain"}`),
      "aria-expanded": String(open === x2.id),
      "aria-haspopup": x2.panel ? "dialog" : void 0,
      onClick: () => {
        if (x2.panel)
          set(open === x2.id ? null : x2.id);
        else if (x2.onClick)
          x2.onClick();
      }
    }, [
      x2.icon ? React16.createElement("span", { key: "i", className: "rr-cstatus__icon", "aria-hidden": "true" }, x2.icon) : null,
      React16.createElement("span", { key: "n", className: "rr-cstatus__name" }, x2.name),
      React16.createElement("span", { key: "v", className: "rr-cstatus__value" }, x2.value),
      x2.level ? React16.createElement(StatusBars, { key: "b", n: x2.level.n, of: x2.level.of, tone: x2.tone }) : null,
      x2.live ? React16.createElement("span", { key: "l", className: "rr-live", title: x2.live }, React16.createElement("span", { className: "rr-visually-hidden" }, x2.live)) : null
    ]))),
    cur && cur.panel ? React16.createElement("div", {
      key: "p",
      className: "rr-cstatus__panel",
      role: "dialog",
      "aria-label": cur.panelLabel || cur.name
    }, cur.panel) : null
  ]);
}

// node_modules/@redrob-labs/ui/dist/esm/components/PromptSuggestions/PromptSuggestions.js
var React17 = __toESM(require_react(), 1);
function PromptSuggestions(props) {
  const items = props.items || [];
  return React17.createElement("div", {
    className: cx("rr-prompts", props.className),
    role: "list",
    "aria-label": props.label || "Suggested prompts"
  }, items.map((item, i) => {
    const text = typeof item === "string" ? item : item.label;
    return React17.createElement("span", { role: "listitem", key: i, className: "rr-prompts__item" }, React17.createElement("button", {
      type: "button",
      className: "rr-prompt",
      onClick: () => {
        if (props.onSelect) {
          props.onSelect(typeof item === "string" ? item : item.value || item.label, item);
        }
      }
    }, [
      React17.createElement("span", { className: "rr-prompt__icon", key: "i" }, icons.sparkle({ width: "100%", height: "100%" })),
      React17.createElement("span", { key: "t" }, text)
    ]));
  }));
}

// node_modules/@redrob-labs/ui/dist/esm/components/AgentAction/AgentAction.js
var React18 = __toESM(require_react(), 1);
var TOOL_STATE_LABEL = { running: "Running", done: "Done", error: "Failed" };
function AgentAction(props) {
  const state2 = props.state || "done";
  const [open, setOpen] = React18.useState(!!props.defaultOpen);
  const id = React18.useRef(nextId("rr-action")).current;
  const stateIcon = state2 === "running" ? null : state2 === "error" ? icons.danger : icons.success;
  return React18.createElement("div", { className: cx("rr-action", props.className) }, [
    React18.createElement("button", {
      type: "button",
      key: "h",
      className: "rr-action__head",
      "aria-expanded": String(open),
      "aria-controls": id,
      onClick: () => setOpen(!open)
    }, [
      React18.createElement("span", { className: "rr-action__icon", key: "i" }, icons.tool({ width: "100%", height: "100%" })),
      React18.createElement("span", { className: "rr-action__name", key: "n" }, props.name),
      React18.createElement("span", { className: "rr-action__summary", key: "s" }, props.summary),
      React18.createElement("span", { className: cx("rr-action__state", `rr-action__state--${state2}`), key: "t" }, [
        state2 === "running" ? React18.createElement("span", { className: "rr-spinner", key: "p", style: { fontSize: "12px" } }) : React18.createElement("span", { key: "p", style: { display: "inline-flex", width: 14, height: 14 } }, stateIcon({
          width: "100%",
          height: "100%"
        })),
        React18.createElement("span", { key: "l" }, props.stateLabel || TOOL_STATE_LABEL[state2]),
        props.duration ? React18.createElement("span", { key: "d", style: { fontWeight: 400, color: "var(--ink-muted)" } }, props.duration) : null
      ]),
      React18.createElement("span", { className: cx("rr-accordion__chevron", open && "rr-accordion__chevron--open"), key: "c" }, icons.chevronDown({ width: 14, height: 14 }))
    ]),
    React18.createElement("div", { className: "rr-action__body", id, key: "b", hidden: !open }, props.children)
  ]);
}

// node_modules/@redrob-labs/ui/dist/esm/components/ApprovalStep/ApprovalStep.js
var React19 = __toESM(require_react(), 1);
function ApprovalStep(props) {
  return React19.createElement("div", { className: cx("rr-approval", props.className), role: "group", "aria-label": props.title }, [
    React19.createElement("div", { className: "rr-approval__head", key: "h" }, [
      React19.createElement("span", { className: "rr-approval__icon", key: "i" }, icons.shield({ width: "100%", height: "100%" })),
      React19.createElement("div", { key: "b", style: { display: "flex", flexDirection: "column", gap: "4px" } }, [
        React19.createElement("span", { className: "rr-approval__title", key: "t" }, props.title),
        props.description ? React19.createElement("span", { className: "rr-approval__what", key: "w" }, props.description) : null
      ])
    ]),
    props.detail ? React19.createElement("div", { className: "rr-approval__detail", key: "d" }, props.detail) : null,
    React19.createElement("div", { className: "rr-approval__actions", key: "a" }, [
      React19.createElement(Button, { key: "approve", size: "sm", onClick: props.onApprove }, props.approveLabel || "Approve"),
      React19.createElement(Button, { key: "reject", size: "sm", variant: "secondary", onClick: props.onReject }, props.rejectLabel || "Reject"),
      props.onAlways ? React19.createElement(Button, { key: "always", size: "sm", variant: "ghost", onClick: props.onAlways }, props.alwaysLabel || "Always allow this") : null
    ])
  ]);
}

// node_modules/@redrob-labs/ui/dist/esm/internal/harness.js
var SCOPE_ICON = {
  files: "file",
  apps: "link",
  web: "globe",
  computer: "tool",
  memory: "passport"
};
var SCOPE_MODE = {
  read: "Can read",
  write: "Can read and write",
  none: "No access"
};

// node_modules/@redrob-labs/ui/dist/esm/components/ScopeBadge/ScopeBadge.js
var React20 = __toESM(require_react(), 1);
function ScopeBadge(props) {
  const scopes = props.scopes || [];
  return React20.createElement("div", {
    className: cx("rr-scope", props.className),
    role: "group",
    "aria-label": props.label || "What this agent can reach"
  }, [
    props.label ? React20.createElement(SectionMark, {
      key: "m",
      label: [props.label],
      trailing: String(scopes.length)
    }) : null,
    scopes.map((s, i) => {
      const Ico = icons[SCOPE_ICON[s.kind] || "shield"];
      const mode = s.mode || "read";
      return React20.createElement("div", { className: "rr-scope__row", key: i }, [
        React20.createElement("span", { className: "rr-scope__icon", key: "i", "aria-hidden": "true" }, React20.createElement(Ico)),
        React20.createElement("span", { className: "rr-scope__label", key: "l", title: s.label }, s.label),
        React20.createElement("span", { className: `rr-scope__mode rr-scope__mode--${mode}`, key: "m" }, SCOPE_MODE[mode] || mode)
      ]);
    })
  ]);
}

// node_modules/@redrob-labs/ui/dist/esm/components/ThemeSwitch/ThemeSwitch.js
var React21 = __toESM(require_react(), 1);

// node_modules/@redrob-labs/ui/dist/esm/internal/theme.js
var THEME_OPTS = [
  { id: "system", icon: "monitor", label: "System" },
  { id: "light", icon: "sun", label: "Light" },
  { id: "dark", icon: "moon", label: "Dark" }
];
function systemDark() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (_a) {
    return false;
  }
}
function themeTarget(t) {
  if (t)
    return t;
  return typeof document !== "undefined" ? document.documentElement : null;
}
function applyTheme(el, mode) {
  if (!el)
    return;
  el.setAttribute("data-theme-mode", mode);
  el.setAttribute("data-theme", mode === "system" ? systemDark() ? "dark" : "light" : mode);
}

// node_modules/@redrob-labs/ui/dist/esm/components/ThemeSwitch/ThemeSwitch.js
function ThemeSwitch(props) {
  const labels = props.labels || {};
  const initial = () => {
    if (props.defaultValue)
      return props.defaultValue;
    let saved = null;
    if (props.storageKey) {
      try {
        saved = window.localStorage.getItem(props.storageKey);
      } catch (_a) {
        saved = null;
      }
    }
    if (saved === "light" || saved === "dark" || saved === "system")
      return saved;
    const el = themeTarget(props.target);
    const m2 = el && el.getAttribute("data-theme-mode");
    if (m2)
      return m2;
    const t = el && el.getAttribute("data-theme");
    return t === "light" || t === "dark" ? t : "system";
  };
  const [held, setHeld] = React21.useState(initial);
  const mode = props.value !== void 0 ? props.value : held;
  const name = React21.useRef(nextId("rr-theme")).current;
  React21.useEffect(() => {
    if (!props.storageKey)
      return;
    let saved = null;
    try {
      saved = window.localStorage.getItem(props.storageKey);
    } catch (_a) {
      saved = null;
    }
    if (saved)
      applyTheme(themeTarget(props.target), saved);
  }, []);
  React21.useEffect(() => {
    if (mode !== "system")
      return void 0;
    let mq;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
    } catch (_a) {
      return void 0;
    }
    const el = themeTarget(props.target);
    function on2() {
      if (el && el.getAttribute("data-theme-mode") === "system")
        applyTheme(el, "system");
    }
    if (mq.addEventListener)
      mq.addEventListener("change", on2);
    else if (mq.addListener)
      mq.addListener(on2);
    return () => {
      if (mq.removeEventListener)
        mq.removeEventListener("change", on2);
      else if (mq.removeListener)
        mq.removeListener(on2);
    };
  }, [mode]);
  React21.useEffect(() => {
    const el = themeTarget(props.target);
    if (!el || typeof MutationObserver === "undefined" || props.value !== void 0)
      return void 0;
    const ob = new MutationObserver(() => {
      const m2 = el.getAttribute("data-theme-mode");
      if (m2)
        setHeld(m2);
    });
    ob.observe(el, { attributes: true, attributeFilter: ["data-theme-mode"] });
    return () => ob.disconnect();
  }, []);
  function choose(id) {
    if (props.value === void 0)
      setHeld(id);
    applyTheme(themeTarget(props.target), id);
    if (props.storageKey) {
      try {
        window.localStorage.setItem(props.storageKey, id);
      } catch (_a) {
      }
    }
    if (props.onChange)
      props.onChange(id);
  }
  function onKey(event) {
    const i = THEME_OPTS.map((o) => o.id).indexOf(mode);
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = THEME_OPTS[(i + 1) % 3];
    if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = THEME_OPTS[(i + 2) % 3];
    if (next) {
      event.preventDefault();
      choose(next.id);
      const btn = event.currentTarget.querySelector(`[data-theme-opt="${next.id}"]`);
      if (btn)
        btn.focus();
    }
  }
  return React21.createElement("div", {
    className: cx("rr-theme", props.size === "sm" && "rr-theme--sm", props.className),
    role: "radiogroup",
    "aria-label": props.label || "Theme",
    onKeyDown: onKey
  }, THEME_OPTS.map((o) => {
    const on2 = o.id === mode;
    const text = labels[o.id] || o.label;
    return React21.createElement("button", {
      type: "button",
      key: o.id,
      role: "radio",
      "aria-checked": String(on2),
      "aria-label": text,
      title: text,
      "data-theme-opt": o.id,
      name,
      tabIndex: on2 ? 0 : -1,
      className: "rr-theme__opt",
      onClick: () => choose(o.id)
    }, icons[o.icon]({ width: 16, height: 16 }));
  }));
}

// src/network/verify-api-key.js
var VERIFY_TIMEOUT_MS = 15e3;
async function verifyApiKey(apiKey, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? VERIFY_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(REDROB_MODELS_URL, {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`
      }
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: "invalid", status: response.status };
  }
  const payload = await readJson(response);
  if (!payload) {
    return { ok: false, reason: "unreachable", status: response.status };
  }
  if (!response.ok) {
    return { ok: false, reason: "unreachable", status: response.status };
  }
  return { ok: true };
}
async function readJson(response) {
  if (!response.headers?.get("content-type")?.includes("application/json")) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// src/network/device-connect.js
var REDROB_DEVICE_API_BASE_URL = `${REDROB_API_BASE_URL}/v1`;
var FALLBACK_TTL_MS = 10 * 6e4;

// src/background/device-connect-orchestrator.js
var DEVICE_CONNECT_START = "DEVICE_CONNECT_START";
var DEVICE_CONNECT_CANCEL = "DEVICE_CONNECT_CANCEL";
var DEVICE_CONNECT_UPDATE = "DEVICE_CONNECT_UPDATE";

// src/ui/device-connect-client.js
function describeDevicePhase(phase, copy) {
  switch (phase?.state) {
    case "waiting":
      return copy.connectWaiting;
    case "unreachable":
      return copy.connectUnreachable;
    case "connected":
      return copy.connectConnected;
    case "denied":
      return copy.connectDenied;
    case "expired":
      return copy.connectExpired;
    case "cancelled":
      return "";
    case "failed":
    default:
      return copy.connectFailed;
  }
}
function isTerminalPhase(phase) {
  return phase?.state === "connected" || phase?.state === "denied" || phase?.state === "expired" || phase?.state === "failed" || phase?.state === "cancelled";
}
async function startDeviceConnect(deps = {}) {
  const sendMessage = deps.sendMessage ?? ((message) => globalThis.chrome.runtime.sendMessage(message));
  const response = await sendMessage({ type: DEVICE_CONNECT_START });
  if (!response?.ok) {
    return { ok: false, code: response?.code ?? "device_start_failed" };
  }
  return {
    ok: true,
    id: response.id,
    userCode: response.userCode,
    verificationUri: response.verificationUri,
    verificationUriComplete: response.verificationUriComplete,
    expiresAt: response.expiresAt
  };
}
async function cancelDeviceConnect(id, deps = {}) {
  const sendMessage = deps.sendMessage ?? ((message) => globalThis.chrome.runtime.sendMessage(message));
  try {
    await sendMessage({ type: DEVICE_CONNECT_CANCEL, id });
  } catch {
  }
}
function subscribeDeviceConnect(id, onPhase, deps = {}) {
  const chromeApi = deps.chrome ?? globalThis.chrome;
  const listener = (message) => {
    if (message?.type === DEVICE_CONNECT_UPDATE && message.id === id) {
      onPhase(message.phase);
    }
  };
  chromeApi?.runtime?.onMessage?.addListener?.(listener);
  return () => chromeApi?.runtime?.onMessage?.removeListener?.(listener);
}

// src/chat/api-key-notice.jsx
function ApiKeyNotice({ copy }) {
  const [mode, setMode] = (0, react_exports.useState)("idle");
  const [connect, setConnect] = (0, react_exports.useState)(null);
  const [phase, setPhase] = (0, react_exports.useState)(null);
  const unsubscribeRef = (0, react_exports.useRef)(null);
  (0, react_exports.useEffect)(
    () => () => {
      unsubscribeRef.current?.();
    },
    []
  );
  const stopWatching = () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  };
  const beginConnect = async () => {
    setMode("connecting");
    setPhase(null);
    const started = await startDeviceConnect();
    if (!started.ok) {
      setPhase({ state: "failed", code: started.code });
      setMode("connect-idle");
      return;
    }
    setConnect({
      id: started.id,
      userCode: started.userCode,
      verificationUri: started.verificationUri,
      verificationUriComplete: started.verificationUriComplete
    });
    setPhase({ state: "waiting" });
    unsubscribeRef.current = subscribeDeviceConnect(started.id, (next) => {
      setPhase(next);
      if (isTerminalPhase(next)) stopWatching();
    });
  };
  const cancelConnect = async () => {
    if (connect?.id) await cancelDeviceConnect(connect.id);
    stopWatching();
    setMode("idle");
    setConnect(null);
    setPhase(null);
  };
  const failed = phase && phase.state !== "connected" && phase.state !== "waiting";
  const tone = phase?.state === "connected" ? "success" : failed ? "warning" : "info";
  return /* @__PURE__ */ import_react.default.createElement(
    Alert,
    {
      tone,
      title: copy.keyNoticeTitle,
      className: "redrob-key-notice",
      action: mode === "idle" ? /* @__PURE__ */ import_react.default.createElement(Button, { size: "sm", onClick: beginConnect }, copy.connectPrimary) : failed ? /* @__PURE__ */ import_react.default.createElement(Button, { size: "sm", onClick: beginConnect }, copy.connectRetry) : null
    },
    mode === "connecting" ? /* @__PURE__ */ import_react.default.createElement("p", { role: "status" }, copy.connectStarting) : null,
    connect && phase && phase.state !== "connected" ? /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-connect-wait" }, /* @__PURE__ */ import_react.default.createElement("p", null, copy.connectEnterCode), /* @__PURE__ */ import_react.default.createElement("code", { className: "redrob-connect-code" }, connect.userCode), /* @__PURE__ */ import_react.default.createElement("p", null, /* @__PURE__ */ import_react.default.createElement(
      "a",
      {
        href: connect.verificationUriComplete || connect.verificationUri,
        target: "_blank",
        rel: "noreferrer"
      },
      connect.verificationUri
    )), /* @__PURE__ */ import_react.default.createElement("p", { role: "status" }, describeDevicePhase(phase, copy)), /* @__PURE__ */ import_react.default.createElement(Button, { size: "sm", variant: "secondary", onClick: cancelConnect }, copy.connectCancel)) : null,
    phase?.state === "connected" ? /* @__PURE__ */ import_react.default.createElement("p", { role: "status" }, copy.connectConnected) : null,
    mode === "idle" ? /* @__PURE__ */ import_react.default.createElement(PasteFallback, { copy }) : mode === "paste" ? /* @__PURE__ */ import_react.default.createElement(PasteFallback, { copy, startOpen: true }) : null
  );
}
function PasteFallback({ copy, startOpen = false }) {
  const [open, setOpen] = (0, react_exports.useState)(startOpen);
  const [apiKey, setApiKey] = (0, react_exports.useState)("");
  const [status, setStatus] = (0, react_exports.useState)("");
  const [saving, setSaving] = (0, react_exports.useState)(false);
  const save = async (event) => {
    event.preventDefault();
    const candidate = apiKey.trim();
    if (!candidate) return;
    setSaving(true);
    setStatus(copy.checking);
    const result = await verifyApiKey(candidate);
    if (!result.ok) {
      setStatus(
        result.reason === "invalid" ? copy.keyRejected : copy.keyUnreachable
      );
      setSaving(false);
      return;
    }
    await persistApiKey(candidate);
    setStatus(copy.connected);
    setSaving(false);
  };
  if (!open) {
    return /* @__PURE__ */ import_react.default.createElement("p", { className: "redrob-key-notice-foot" }, /* @__PURE__ */ import_react.default.createElement(Button, { variant: "ghost", size: "sm", onClick: () => setOpen(true) }, copy.connectPasteInstead));
  }
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("form", { onSubmit: save }, /* @__PURE__ */ import_react.default.createElement(
    Input,
    {
      type: "password",
      autoComplete: "off",
      value: apiKey,
      label: copy.apiKeyLabel,
      placeholder: "rrk_...",
      size: "sm",
      onChange: (event) => setApiKey(event.target.value)
    }
  ), /* @__PURE__ */ import_react.default.createElement(Button, { type: "submit", size: "sm", disabled: saving || !apiKey.trim() }, saving ? copy.checking : copy.connect)), /* @__PURE__ */ import_react.default.createElement("p", { className: "redrob-key-notice-foot" }, /* @__PURE__ */ import_react.default.createElement("a", { href: REDROB_CONSOLE_URL, target: "_blank", rel: "noreferrer" }, copy.getKey), /* @__PURE__ */ import_react.default.createElement("span", { role: "status" }, status)));
}

// src/chat/header-settings.jsx
function AppearanceControl({ copy }) {
  const [appearance, setAppearance] = (0, react_exports.useState)("system");
  (0, react_exports.useEffect)(() => {
    let active = true;
    void readAppearance().then((mode) => {
      if (active) setAppearance(mode);
    });
    return () => {
      active = false;
    };
  }, []);
  const choose = async (mode) => {
    if (!APPEARANCE_MODES.includes(mode)) {
      return;
    }
    setAppearance(mode);
    await writeAppearance(mode);
  };
  return /* @__PURE__ */ import_react.default.createElement(
    ThemeSwitch,
    {
      value: appearance,
      target: typeof document === "undefined" ? null : document.body,
      label: copy.appearanceTitle,
      labels: copy.appearanceLabels,
      size: "sm",
      onChange: choose
    }
  );
}
function LanguageControl({ copy, locale, onLocaleChange }) {
  return /* @__PURE__ */ import_react.default.createElement(
    Select,
    {
      value: locale,
      label: copy.languageTitle,
      size: "sm",
      options: SUPPORTED_LOCALES.map((value) => ({
        value,
        label: LOCALE_LABELS[value] ?? value
      })),
      onChange: (event, option) => {
        const next = option?.value ?? event?.target?.value;
        if (next && SUPPORTED_LOCALES.includes(next)) {
          onLocaleChange(next);
        }
      }
    }
  );
}

// src/chat/conversation-export.js
function toExportPayload(messages, now = /* @__PURE__ */ new Date()) {
  return {
    exportedAt: now.toISOString(),
    messages: messages.map((message) => {
      const entry = {
        role: message.role,
        text: message.text ?? void 0
      };
      if (message.role === "tool") {
        entry.tool = message.toolName;
        entry.label = message.label;
        entry.status = message.status;
        entry.detail = message.detail;
      }
      return entry;
    })
  };
}
function exportFilename(now = /* @__PURE__ */ new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `redrob-conversation-${stamp}.json`;
}
function exportConversation(messages, now = /* @__PURE__ */ new Date()) {
  const blob = new Blob(
    [JSON.stringify(toExportPayload(messages, now), null, 2)],
    {
      type: "application/json"
    }
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFilename(now);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1e4);
}

// src/chat/overflow-menu.jsx
function OverflowMenu({ copy, messages }) {
  const items = [
    {
      id: "export",
      label: copy.exportConversation,
      disabled: messages.length === 0,
      onSelect: () => exportConversation(messages)
    },
    {
      id: "settings",
      label: copy.settings,
      onSelect: () => chrome.runtime.openOptionsPage()
    }
  ];
  return /* @__PURE__ */ import_react.default.createElement(
    Menu,
    {
      label: copy.moreOptions,
      items,
      variant: "ghost",
      align: "right"
    }
  );
}

// src/chat/redrob-brand.jsx
var MARK_PATH = "M259.8 320V200L399.89 250.99L400 251.03V327.21L199.99 400.01L0 327.21V251.02L0.08 250.99L140.17 200V276.45L259.8 320ZM400 148.97V72.8L199.99 0L0 72.79V148.98L0.08 149.01L140.17 199.99V123.8L259.8 80.26V199.99L399.89 149.01L400 148.96V148.97Z";
var WORDMARK_PATHS = [
  "M673.33 128.57H589.23V326.78H519.7V72.0701H673.33V128.57Z",
  "M820.91 68.73C843.8 68.73 864.17 73.56 882.32 83.21C904.89 95.07 917.8 113.25 925.03 126.55C935.85 146.43 940.74 169.6 940.74 197.69V221.43H766.35C766.35 234.07 768.67 241.12 773.5 250.48C778.23 259.84 798.9 277.99 825.06 277.99C851.22 277.99 866.2 264.57 871.12 256.56C871.12 256.56 873.34 253.47 874.02 252.41C879.14 254.34 932.26 273.62 932.34 273.65L930.22 277.99C927.03 284.07 923.17 289.77 918.63 295.08C908.39 306.76 895.26 315.83 879.04 322.3C862.82 328.77 844.37 331.95 823.71 331.95C797.83 331.95 775.43 326.64 756.6 316.02C737.77 305.4 723.19 290.15 713.05 270.36C702.91 250.57 697.79 226.73 697.79 200.57C697.79 174.41 702.71 151.44 712.85 131.46C722.99 111.48 737.38 96.04 756.01 85.13C774.65 74.22 796.28 68.72 820.9 68.72L820.91 68.73ZM821.1 123.65C783.63 123.65 768.19 141.89 766.06 174.04H876.14C874.02 141.8 858.57 123.65 821.1 123.65Z",
  "M1226.33 326.86H1157.7V307.75C1139.17 328.41 1114.55 331.11 1089.65 331.11C1031.74 331.11 976.81 296.07 976.81 199.73C976.81 124.63 1022.47 68.8301 1089.65 68.8301L1089.75 68.7301C1111.18 68.7301 1139.75 72.2101 1156.83 92.5701V4.84009H1226.33V326.87V326.86ZM1101.62 123.96C1064.84 124.44 1045.73 140.27 1045.73 200.99C1045.73 261.71 1064.84 277.54 1101.62 278.02C1138.4 277.54 1157.51 261.61 1157.51 200.99C1157.51 140.37 1138.4 124.44 1101.62 123.96Z",
  "M1440.16 128.57H1356.06V326.78H1286.54V72.0701H1440.16V128.57Z",
  "M1588.97 68.76C1614.37 68.76 1636.48 74.16 1655.5 85.06C1674.53 95.96 1689.11 111.4 1699.25 131.18C1709.39 151.05 1714.5 174.02 1714.5 200.16C1714.5 226.3 1709.39 249.27 1699.25 269.24C1689.01 289.21 1674.53 304.65 1655.5 315.55C1636.48 326.45 1614.37 331.95 1588.97 331.95C1563.57 331.95 1541.56 326.45 1522.73 315.55C1504 304.65 1489.42 289.21 1479.28 269.24C1469.14 249.27 1464.02 226.31 1464.02 200.16C1464.02 174.01 1468.95 150.96 1479.08 131.18C1489.13 111.31 1503.71 95.97 1522.54 85.06C1541.46 74.16 1563.58 68.76 1588.97 68.76ZM1590.9 124.04C1554.11 124.52 1534.99 140.44 1534.99 201.03C1534.99 261.62 1554.11 277.54 1590.9 278.02C1627.69 277.54 1646.81 261.72 1646.81 201.03C1646.81 140.34 1627.69 124.53 1590.9 124.04Z",
  "M1819.98 92.5801C1837.07 72.2101 1865.64 68.7401 1887.07 68.7401L1887.16 68.8401C1954.34 68.8401 2000 124.64 2000 199.74C2000 296.08 1945.08 331.12 1887.16 331.12C1862.26 331.12 1837.64 328.42 1819.11 307.76V326.87H1750.48V4.84009H1819.98V92.5901V92.5801ZM1875.19 123.96C1838.42 124.44 1819.31 140.37 1819.31 200.99C1819.31 261.61 1838.42 277.54 1875.19 278.02C1911.97 277.54 1931.08 261.71 1931.08 200.99C1931.08 140.27 1911.97 124.44 1875.19 123.96Z"
];
var MARK_BLUE = "#2B52FF";
var GLOW_TEAL = "#44FFE3";
var GLOW_STOPS = [
  [0, 0.737],
  [0.22, 0.62],
  [0.44, 0.417],
  [0.67, 0.21],
  [0.89, 0.037],
  [1, 0]
];
function BrandMark({ animated = false }) {
  const scope = (0, react_exports.useId)().replace(/[^a-zA-Z0-9]/g, "");
  const maskId = `redrob-mark-${scope}`;
  const glowId = `redrob-glow-${scope}`;
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("path", { d: MARK_PATH, fill: MARK_BLUE }), /* @__PURE__ */ import_react.default.createElement(
    "mask",
    {
      id: maskId,
      maskUnits: "userSpaceOnUse",
      x: "0",
      y: "0",
      width: "400",
      height: "401",
      style: { maskType: "luminance" }
    },
    /* @__PURE__ */ import_react.default.createElement("path", { d: MARK_PATH, fill: "#fff" })
  ), /* @__PURE__ */ import_react.default.createElement("g", { mask: `url(#${maskId})` }, /* @__PURE__ */ import_react.default.createElement(
    "circle",
    {
      className: animated ? "redrob-mark-blob" : void 0,
      cx: "199",
      cy: "199",
      r: "206",
      fill: `url(#${glowId})`
    }
  )), /* @__PURE__ */ import_react.default.createElement("defs", null, /* @__PURE__ */ import_react.default.createElement(
    "radialGradient",
    {
      id: glowId,
      cx: "199",
      cy: "199",
      r: "206",
      gradientUnits: "userSpaceOnUse"
    },
    GLOW_STOPS.map(([offset, opacity]) => /* @__PURE__ */ import_react.default.createElement(
      "stop",
      {
        key: offset,
        offset,
        stopColor: GLOW_TEAL,
        stopOpacity: opacity
      }
    ))
  )));
}
function RedrobResponseMark({ streaming = false }) {
  return /* @__PURE__ */ import_react.default.createElement(
    "svg",
    {
      viewBox: "0 0 400 400",
      className: "redrob-mark redrob-reply-mark h-5 w-5 shrink-0",
      "data-redrob-state": streaming ? "streaming" : "static",
      role: "img",
      "aria-label": "Redrob"
    },
    /* @__PURE__ */ import_react.default.createElement(BrandMark, { animated: true })
  );
}
function RedrobWordmark({ className = "h-6" }) {
  return /* @__PURE__ */ import_react.default.createElement(
    "svg",
    {
      viewBox: "0 0 2000 400",
      className: `w-auto ${className}`,
      role: "img",
      "aria-label": "Redrob"
    },
    /* @__PURE__ */ import_react.default.createElement(BrandMark, null),
    WORDMARK_PATHS.map((path) => /* @__PURE__ */ import_react.default.createElement("path", { key: path, d: path, fill: "currentColor" }))
  );
}

// src/chat/chat-header.jsx
function NewChatIcon() {
  return /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react.default.createElement(
    "path",
    {
      d: "M11.5 3.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7M13 3l4 4-6.5 6.5-4 .5.5-4L13 3Z",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ));
}
function ChatHeader({
  onNewChat,
  canStartNewChat,
  copy,
  messages,
  locale,
  onLocaleChange
}) {
  return /* @__PURE__ */ import_react.default.createElement("header", { className: "redrob-chat-header" }, /* @__PURE__ */ import_react.default.createElement(RedrobWordmark, { className: "redrob-chat-header-mark" }), /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-chat-header-actions" }, /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      type: "button",
      className: "redrob-icon-button",
      onClick: onNewChat,
      disabled: !canStartNewChat,
      "aria-label": copy.newChat,
      title: copy.newChat
    },
    /* @__PURE__ */ import_react.default.createElement(NewChatIcon, null)
  ), /* @__PURE__ */ import_react.default.createElement(AppearanceControl, { copy }), /* @__PURE__ */ import_react.default.createElement(
    LanguageControl,
    {
      copy,
      locale,
      onLocaleChange
    }
  ), /* @__PURE__ */ import_react.default.createElement(OverflowMenu, { copy, messages })));
}

// src/chat/permission-mode.jsx
function usePermissionMode() {
  const [mode, setMode] = (0, react_exports.useState)("ask");
  (0, react_exports.useEffect)(() => {
    let active = true;
    void readPermissionMode().then((stored) => {
      if (active) setMode(stored);
    });
    return () => {
      active = false;
    };
  }, []);
  const choose = async (next) => {
    if (!PERMISSION_MODES.includes(next)) {
      return;
    }
    setMode(next);
    await writePermissionMode(next);
  };
  return { mode, choose };
}
function labelFor(copy, value) {
  return value === "ask" ? copy.permissionModeAsk : copy.permissionModeAuto;
}
function hintFor(copy, value) {
  return value === "ask" ? copy.permissionAskBody : copy.permissionAutoBody;
}
function PermissionModePanel({ copy, mode, choose }) {
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-mode-panel" }, PERMISSION_MODES.map((value) => /* @__PURE__ */ import_react.default.createElement(
    Radio,
    {
      key: value,
      name: "redrob-permission-mode",
      value,
      checked: mode === value,
      label: labelFor(copy, value),
      hint: hintFor(copy, value),
      onChange: () => void choose(value)
    }
  )));
}
function permissionModeStatusItem({ copy, mode, choose }) {
  return {
    id: "permission-mode",
    name: copy.togglePermissionMode,
    value: labelFor(copy, mode),
    tone: mode === "auto" ? "warning" : void 0,
    panelLabel: copy.togglePermissionMode,
    panel: /* @__PURE__ */ import_react.default.createElement(PermissionModePanel, { copy, mode, choose })
  };
}

// src/settings/prompt-shortcuts.js
var SHORTCUTS_STORAGE_KEY = "redrobPromptShortcuts";
function storageArea5() {
  return globalThis.chrome?.storage?.local;
}
function normalizeShortcutName(name) {
  return String(name ?? "").replace(/^[\s/]+/, "").trimEnd().replace(/\s+/g, "-").slice(0, 32);
}
function isValidShortcut(shortcut) {
  return Boolean(
    normalizeShortcutName(shortcut?.name) && String(shortcut?.prompt ?? "").trim()
  );
}
async function readShortcuts() {
  try {
    const stored = await storageArea5()?.get(SHORTCUTS_STORAGE_KEY);
    const list = stored?.[SHORTCUTS_STORAGE_KEY];
    return Array.isArray(list) ? list.filter(isValidShortcut) : [];
  } catch {
    return [];
  }
}
function matchShortcuts(shortcuts, query) {
  const term = String(query ?? "").replace(/^\//, "").toLowerCase();
  if (!term) return shortcuts;
  return shortcuts.filter(
    (item) => item.name.toLowerCase().includes(term) || item.prompt.toLowerCase().includes(term)
  );
}
function readShortcutQuery(inputText) {
  const match = /^\/([^\s/]*)$/.exec(inputText ?? "");
  return match ? match[1] : null;
}

// src/chat/composer-actions.js
var ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp"
];
function isAcceptedImage(file) {
  return ACCEPTED_IMAGE_TYPES.includes(file?.type);
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
async function sendToBackground(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.success) {
    throw new Error(response?.error || "The background request failed.");
  }
  return response.result ?? {};
}
async function attachImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const { imageId } = await sendToBackground({
    type: "REGISTER_CAPTURED_IMAGE",
    dataUrl
  });
  return { imageId, name: file.name, dataUrl };
}
function runGifCreator(action, args = {}) {
  return sendToBackground({
    type: "EXECUTE_BROWSER_TOOL",
    toolName: "gif_creator",
    args: { action, ...args }
  });
}
function startWorkflowRecording() {
  return runGifCreator("start_recording");
}
function exportWorkflowRecording() {
  return runGifCreator("export", { download: true });
}
function discardWorkflowRecording() {
  return runGifCreator("clear");
}
function describeAttachments(attachments) {
  if (!attachments.length) return "";
  const handles = attachments.map((attachment) => `${attachment.imageId} (${attachment.name})`).join(", ");
  return `

[Attached images: ${handles}. Put one on the page with the upload_image tool, passing its imageId plus a ref or coordinate.]`;
}

// src/chat/composer.jsx
var COMPOSER_MAX_ROWS = 7;
var PLACEHOLDER_ROTATE_MS = 4200;
function ImageIcon() {
  return /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react.default.createElement("g", { fill: "none", stroke: "currentColor", strokeWidth: "1.5" }, /* @__PURE__ */ import_react.default.createElement("rect", { x: "3", y: "4.5", width: "14", height: "11", rx: "2" }), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "7.5", cy: "8.5", r: "1.2" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M4 13.5l3.5-3.2 3 2.6 2.4-2 3.1 2.8", strokeLinejoin: "round" })));
}
function RecordIcon({ active }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false" }, active ? /* @__PURE__ */ import_react.default.createElement(
    "rect",
    {
      x: "6.5",
      y: "6.5",
      width: "7",
      height: "7",
      rx: "1.5",
      fill: "currentColor"
    }
  ) : /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement(
    "circle",
    {
      cx: "10",
      cy: "10",
      r: "6.2",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5"
    }
  ), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "10", cy: "10", r: "3", fill: "currentColor" })));
}
function Composer2({ onSend, onStop, copy, disabled = false }) {
  const { inputText, isSending, messages } = useRedrobChatStore(import_react.default);
  const setInputText = redrobChatStore.getState().setInputText;
  const inputRef = (0, react_exports.useRef)(null);
  const fileRef = (0, react_exports.useRef)(null);
  const [attachments, setAttachments] = (0, react_exports.useState)([]);
  const [isRecording, setIsRecording] = (0, react_exports.useState)(false);
  const [error, setError] = (0, react_exports.useState)("");
  const [shortcuts, setShortcuts] = (0, react_exports.useState)([]);
  const [placeholderIndex, setPlaceholderIndex] = (0, react_exports.useState)(0);
  (0, react_exports.useEffect)(() => {
    if (inputText || messages.length) return void 0;
    const timer = setInterval(
      () => setPlaceholderIndex((index) => index + 1),
      PLACEHOLDER_ROTATE_MS
    );
    return () => clearInterval(timer);
  }, [inputText, messages.length]);
  (0, react_exports.useEffect)(() => {
    let active = true;
    void readShortcuts().then((list) => {
      if (active) setShortcuts(list);
    });
    return () => {
      active = false;
    };
  }, [messages.length]);
  const { mode, choose: chooseMode } = usePermissionMode();
  const shortcutQuery = readShortcutQuery(inputText);
  const shortcutMatches = shortcutQuery === null ? [] : matchShortcuts(shortcuts, shortcutQuery);
  const rotating = copy.starterPrompts.length ? copy.starterPrompts[placeholderIndex % copy.starterPrompts.length].prompt : copy.composerPlaceholder;
  const placeholder = inputText || messages.length ? copy.composerPlaceholder : rotating;
  const send = async (text) => {
    const trimmed2 = text.trim();
    if (!trimmed2 || isSending) return;
    setInputText("");
    const outgoing = trimmed2 + describeAttachments(attachments);
    setAttachments([]);
    await onSend(outgoing);
  };
  const pickImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setError(copy.uploadTypeError);
      return;
    }
    setError("");
    try {
      setAttachments((current) => [
        ...current,
        { pending: true, name: file.name }
      ]);
      const attached = await attachImage(file);
      setAttachments((current) => [
        ...current.filter((item) => !item.pending),
        attached
      ]);
    } catch {
      setAttachments((current) => current.filter((item) => !item.pending));
      setError(copy.uploadFailed);
    }
  };
  const toggleRecording = async () => {
    setError("");
    try {
      if (isRecording) {
        await exportWorkflowRecording();
        setIsRecording(false);
      } else {
        await startWorkflowRecording();
        setIsRecording(true);
      }
    } catch {
      setError(copy.recordingFailed);
      if (isRecording) {
        await discardWorkflowRecording().catch(() => {
        });
        setIsRecording(false);
      }
    }
  };
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-composer-dock" }, isRecording ? /* @__PURE__ */ import_react.default.createElement("p", { className: "redrob-recording-banner", role: "status" }, /* @__PURE__ */ import_react.default.createElement("span", { "aria-hidden": "true", className: "redrob-recording-dot" }), copy.recordingHint) : null, error ? /* @__PURE__ */ import_react.default.createElement("p", { className: "redrob-composer-error", role: "alert" }, error) : null, shortcutMatches.length ? /* @__PURE__ */ import_react.default.createElement(
    PromptSuggestions,
    {
      label: copy.composerHint,
      items: shortcutMatches.slice(0, 6).map((shortcut) => ({
        value: shortcut.prompt,
        label: `/${shortcut.name}`,
        description: shortcut.prompt
      })),
      onSelect: (value) => setInputText(value ?? "")
    }
  ) : null, /* @__PURE__ */ import_react.default.createElement(
    "input",
    {
      ref: fileRef,
      type: "file",
      accept: ACCEPTED_IMAGE_TYPES.join(","),
      className: "sr-only",
      onChange: pickImage,
      tabIndex: -1
    }
  ), /* @__PURE__ */ import_react.default.createElement(
    Composer,
    {
      value: inputText,
      label: copy.composerHint,
      placeholder,
      disabled,
      busy: isSending,
      maxRows: COMPOSER_MAX_ROWS,
      submitLabel: copy.sendMessage,
      stopLabel: copy.stopGenerating,
      onChange: setInputText,
      onSubmit: (value) => void send(value),
      onStop,
      context: attachments.length ? /* @__PURE__ */ import_react.default.createElement("ul", { className: "redrob-attachments" }, attachments.map((attachment, index) => /* @__PURE__ */ import_react.default.createElement("li", { key: attachment.imageId ?? `pending-${index}` }, attachment.dataUrl ? /* @__PURE__ */ import_react.default.createElement("img", { src: attachment.dataUrl, alt: "" }) : null, /* @__PURE__ */ import_react.default.createElement("span", null, attachment.name), attachment.imageId ? /* @__PURE__ */ import_react.default.createElement(
        IconButton,
        {
          label: copy.removeAttachment,
          onClick: () => setAttachments(
            (current) => current.filter(
              (item) => item.imageId !== attachment.imageId
            )
          )
        },
        "×"
      ) : null))) : null,
      leading: /* @__PURE__ */ import_react.default.createElement(
        IconButton,
        {
          label: copy.uploadImage,
          onClick: () => fileRef.current?.click()
        },
        /* @__PURE__ */ import_react.default.createElement(ImageIcon, null)
      ),
      status: /* @__PURE__ */ import_react.default.createElement(
        ComposerStatus,
        {
          label: copy.composerHint,
          items: [
            permissionModeStatusItem({ copy, mode, choose: chooseMode })
          ]
        }
      ),
      tools: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement(
        IconButton,
        {
          label: isRecording ? copy.stopRecording : copy.startRecording,
          "aria-pressed": isRecording,
          onClick: toggleRecording
        },
        /* @__PURE__ */ import_react.default.createElement(RecordIcon, { active: isRecording })
      ))
    }
  ));
}

// src/chat/conversation-storage.js
var STORAGE_KEY = "redrobConversation";
var MAX_PERSISTED_MESSAGES = 200;
var SAVE_DEBOUNCE_MS = 300;
function toPersistedMessage(message) {
  const { imageDataUrl: _image, args: _args, ...rest } = message;
  return rest.streaming ? { ...rest, streaming: false } : rest;
}
function storageArea6() {
  return globalThis.chrome?.storage?.local;
}
async function restoreConversation() {
  const area = storageArea6();
  if (!area) return;
  try {
    const stored = await area.get(STORAGE_KEY);
    const messages = stored?.[STORAGE_KEY];
    if (Array.isArray(messages) && messages.length) {
      redrobChatStore.getState().setMessages(messages);
    }
  } catch {
  }
}
async function clearConversation() {
  redrobChatStore.getState().reset();
  try {
    await storageArea6()?.remove(STORAGE_KEY);
  } catch {
  }
}
function persistConversationOnChange() {
  let timer;
  return redrobChatStore.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const area = storageArea6();
      if (!area) return;
      const { messages } = redrobChatStore.getState();
      const persisted = messages.slice(-MAX_PERSISTED_MESSAGES).map(toPersistedMessage);
      area.set({ [STORAGE_KEY]: persisted }).catch(() => {
      });
    }, SAVE_DEBOUNCE_MS);
  });
}

// src/chat/capabilities.js
var META_TOOLS = /* @__PURE__ */ new Set(["browser_batch"]);
var GROUPS = [
  // Read groups. Nothing here changes the page or the browser.
  {
    id: "reading",
    kind: "web",
    tools: ["tabs_context", "read_page", "get_page_text", "find"]
  },
  {
    id: "inspecting",
    kind: "web",
    tools: ["read_console_messages", "read_network_requests"]
  },
  { id: "capturing", kind: "computer", tools: ["gif_creator"] },
  // Write groups. Each of these stops and asks before it acts.
  {
    id: "browsing",
    kind: "web",
    tools: ["navigate", "tabs_create", "tabs_close"]
  },
  { id: "acting", kind: "computer", tools: ["form_input", "computer"] },
  { id: "running", kind: "computer", tools: ["javascript_tool"] },
  { id: "window", kind: "computer", tools: ["resize_window", "upload_image"] }
];
var KNOWN_TOOLS = new Set(BROWSER_TOOLS.map((tool) => tool.name));
for (const group of GROUPS) {
  for (const name of group.tools) {
    if (!KNOWN_TOOLS.has(name)) {
      throw new Error(
        `capabilities: "${name}" is not a tool the agent has. A group may only name entries in BROWSER_TOOLS, or this surface promises what cannot be done.`
      );
    }
  }
}
var GROUPED = new Set(GROUPS.flatMap((group) => group.tools));
var UNACCOUNTED = [...KNOWN_TOOLS].filter(
  (name) => !GROUPED.has(name) && !META_TOOLS.has(name)
);
if (UNACCOUNTED.length > 0) {
  throw new Error(
    `capabilities: ${UNACCOUNTED.join(", ")} belong to no group. Every tool is either a capability worth naming or an explicit META_TOOLS exclusion.`
  );
}
function capabilityGroups() {
  return GROUPS.map((group) => {
    const writes = group.tools.filter((name) => WRITE_TOOLS.has(name));
    if (writes.length > 0 && writes.length !== group.tools.length) {
      throw new Error(
        `capabilities: group "${group.id}" mixes read and write tools (${writes.join(", ")} write). Split it, or its badge misleads about the rest.`
      );
    }
    return { ...group, mode: writes.length > 0 ? "write" : "read" };
  });
}
function capabilityScopes(copy) {
  return capabilityGroups().map((group) => ({
    kind: group.kind,
    label: copy.capabilityLabels[group.id],
    mode: group.mode
  }));
}

// src/chat/launch-surface.jsx
function LaunchSurface({ copy, onPick, disabled }) {
  const groups = capabilityGroups();
  const reads = groups.filter((group) => group.mode === "read");
  const writes = groups.filter((group) => group.mode === "write");
  const section = (list, note) => ({
    note,
    items: list.map((group) => ({
      id: group.id,
      title: copy.capabilityLabels[group.id],
      // The count is the honest number of tools behind the claim.
      meta: group.tools.length,
      content: /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-launch-prompt" }, /* @__PURE__ */ import_react.default.createElement("p", null, copy.capabilityPrompts[group.id]), /* @__PURE__ */ import_react.default.createElement(
        Button,
        {
          variant: "secondary",
          size: "sm",
          disabled,
          onClick: () => onPick(copy.capabilityPrompts[group.id])
        },
        copy.tryPrompt
      ))
    }))
  });
  const readSection = section(reads, copy.capabilityReadNote);
  const writeSection = section(writes, copy.capabilityWriteNote);
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "redrob-launch", "aria-labelledby": "redrob-launch-title" }, /* @__PURE__ */ import_react.default.createElement("h2", { id: "redrob-launch-title" }, copy.capabilityTitle), /* @__PURE__ */ import_react.default.createElement(
    ScopeBadge,
    {
      label: copy.capabilityTitle,
      scopes: capabilityScopes(copy)
    }
  ), /* @__PURE__ */ import_react.default.createElement("p", { className: "redrob-launch-note" }, readSection.note), /* @__PURE__ */ import_react.default.createElement(Accordion, { items: readSection.items }), /* @__PURE__ */ import_react.default.createElement("p", { className: "redrob-launch-note" }, writeSection.note), /* @__PURE__ */ import_react.default.createElement(Accordion, { items: writeSection.items }));
}

// src/chat/empty-state.jsx
function EmptyStateArt() {
  const scope = (0, react_exports.useId)().replace(/[^a-zA-Z0-9]/g, "");
  const glow = `redrob-empty-glow-${scope}`;
  const sheen = `redrob-empty-sheen-${scope}`;
  return /* @__PURE__ */ import_react.default.createElement(
    "svg",
    {
      className: "redrob-empty-art",
      viewBox: "0 0 240 160",
      role: "img",
      "aria-hidden": "true",
      focusable: "false"
    },
    /* @__PURE__ */ import_react.default.createElement("defs", null, /* @__PURE__ */ import_react.default.createElement("radialGradient", { id: glow, cx: "0.5", cy: "0.5", r: "0.5" }, /* @__PURE__ */ import_react.default.createElement("stop", { offset: "0", stopColor: "#44FFE3", stopOpacity: "0.55" }), /* @__PURE__ */ import_react.default.createElement("stop", { offset: "0.55", stopColor: "#2B52FF", stopOpacity: "0.22" }), /* @__PURE__ */ import_react.default.createElement("stop", { offset: "1", stopColor: "#2B52FF", stopOpacity: "0" })), /* @__PURE__ */ import_react.default.createElement("linearGradient", { id: sheen, x1: "0", y1: "0", x2: "1", y2: "1" }, /* @__PURE__ */ import_react.default.createElement("stop", { offset: "0", stopColor: "#2B52FF", stopOpacity: "0.16" }), /* @__PURE__ */ import_react.default.createElement("stop", { offset: "1", stopColor: "#44FFE3", stopOpacity: "0.1" }))),
    /* @__PURE__ */ import_react.default.createElement("ellipse", { cx: "120", cy: "74", rx: "86", ry: "58", fill: `url(#${glow})` }),
    /* @__PURE__ */ import_react.default.createElement(
      "rect",
      {
        x: "46",
        y: "30",
        width: "148",
        height: "86",
        rx: "10",
        className: "redrob-empty-window redrob-empty-window-back"
      }
    ),
    /* @__PURE__ */ import_react.default.createElement(
      "rect",
      {
        x: "38",
        y: "38",
        width: "164",
        height: "94",
        rx: "11",
        className: "redrob-empty-window"
      }
    ),
    /* @__PURE__ */ import_react.default.createElement(
      "rect",
      {
        x: "38",
        y: "38",
        width: "164",
        height: "94",
        rx: "11",
        fill: `url(#${sheen})`
      }
    ),
    /* @__PURE__ */ import_react.default.createElement(
      "path",
      {
        d: "M38 49a11 11 0 0 1 11-11h142a11 11 0 0 1 11 11v3H38v-3Z",
        className: "redrob-empty-chrome"
      }
    ),
    /* @__PURE__ */ import_react.default.createElement("circle", { cx: "50", cy: "45", r: "2.2", className: "redrob-empty-dot" }),
    /* @__PURE__ */ import_react.default.createElement("circle", { cx: "58", cy: "45", r: "2.2", className: "redrob-empty-dot" }),
    /* @__PURE__ */ import_react.default.createElement("circle", { cx: "66", cy: "45", r: "2.2", className: "redrob-empty-dot" }),
    /* @__PURE__ */ import_react.default.createElement(
      "rect",
      {
        x: "52",
        y: "64",
        width: "62",
        height: "6",
        rx: "3",
        className: "redrob-empty-line"
      }
    ),
    /* @__PURE__ */ import_react.default.createElement(
      "rect",
      {
        x: "52",
        y: "78",
        width: "96",
        height: "5",
        rx: "2.5",
        className: "redrob-empty-line redrob-empty-line-dim"
      }
    ),
    /* @__PURE__ */ import_react.default.createElement(
      "rect",
      {
        x: "52",
        y: "89",
        width: "78",
        height: "5",
        rx: "2.5",
        className: "redrob-empty-line redrob-empty-line-dim"
      }
    ),
    /* @__PURE__ */ import_react.default.createElement(
      "rect",
      {
        x: "50",
        y: "102",
        width: "66",
        height: "16",
        rx: "6",
        className: "redrob-empty-target"
      }
    ),
    /* @__PURE__ */ import_react.default.createElement("g", { className: "redrob-empty-cursor" }, /* @__PURE__ */ import_react.default.createElement(
      "path",
      {
        d: "M0 0v15l3.9-3.9L6.6 17l3.1-1.4-2.7-5.7H12L0 0Z",
        transform: "translate(108 100)",
        className: "redrob-empty-pointer"
      }
    )),
    /* @__PURE__ */ import_react.default.createElement("circle", { cx: "172", cy: "94", r: "30", fill: `url(#${glow})` }),
    /* @__PURE__ */ import_react.default.createElement("g", { transform: "translate(153 75) scale(0.096)" }, /* @__PURE__ */ import_react.default.createElement(
      "path",
      {
        d: "M259.8 320V200L399.89 250.99L400 251.03V327.21L199.99 400.01L0 327.21V251.02L0.08 250.99L140.17 200V276.45L259.8 320ZM400 148.97V72.8L199.99 0L0 72.79V148.98L0.08 149.01L140.17 199.99V123.8L259.8 80.26V199.99L399.89 149.01L400 148.96V148.97Z",
        fill: "#2B52FF"
      }
    )),
    /* @__PURE__ */ import_react.default.createElement("g", { className: "redrob-empty-spark" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M196 60l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6L196 60Z" }), /* @__PURE__ */ import_react.default.createElement(
      "path",
      {
        d: "M74 118l1.1 3 3 1.1-3 1.1-1.1 3-1.1-3-3-1.1 3-1.1 1.1-3Z",
        opacity: "0.7"
      }
    ))
  );
}
function EmptyState({ copy, onPick, disabled }) {
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-empty" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-empty-hero" }, /* @__PURE__ */ import_react.default.createElement(EmptyStateArt, null), /* @__PURE__ */ import_react.default.createElement("h2", { className: "redrob-empty-title" }, copy.emptyTitle), /* @__PURE__ */ import_react.default.createElement("p", { className: "redrob-empty-body" }, copy.emptyBody)), /* @__PURE__ */ import_react.default.createElement("div", { id: "redrob-starter", className: "redrob-starter" }, copy.starterPrompts.map((starter) => /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      key: starter.title,
      type: "button",
      className: "redrob-starter-card",
      disabled,
      onClick: () => onPick(starter.prompt)
    },
    /* @__PURE__ */ import_react.default.createElement("span", { className: "redrob-starter-card-title" }, starter.title),
    /* @__PURE__ */ import_react.default.createElement("span", { className: "redrob-starter-card-body" }, starter.prompt)
  ))), /* @__PURE__ */ import_react.default.createElement(LaunchSurface, { copy, onPick, disabled }));
}

// src/chat/message-grouping.js
function groupMessages(messages) {
  const grouped = [];
  for (const message of messages) {
    const previous = grouped[grouped.length - 1];
    if (message.role === "tool") {
      if (previous?.kind === "toolRun") {
        previous.steps.push(message);
      } else {
        grouped.push({ kind: "toolRun", id: message.id, steps: [message] });
      }
    } else {
      grouped.push({ kind: "message", id: message.id, message });
    }
  }
  return grouped;
}

// src/chat/markdown.jsx
function InlineTokens({ tokens, text, renderMath }) {
  if (!tokens?.length) {
    return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, renderMath ? renderMath(text ?? "") : text ?? "");
  }
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, tokens.map((token, index) => {
    const key = `${token.type}-${index}`;
    switch (token.type) {
      case "strong":
        return /* @__PURE__ */ import_react.default.createElement("strong", { key, className: "font-semibold" }, /* @__PURE__ */ import_react.default.createElement(
          InlineTokens,
          {
            tokens: token.tokens,
            text: token.text,
            renderMath
          }
        ));
      case "em":
        return /* @__PURE__ */ import_react.default.createElement("em", { key }, /* @__PURE__ */ import_react.default.createElement(
          InlineTokens,
          {
            tokens: token.tokens,
            text: token.text,
            renderMath
          }
        ));
      case "del":
        return /* @__PURE__ */ import_react.default.createElement("del", { key }, /* @__PURE__ */ import_react.default.createElement(
          InlineTokens,
          {
            tokens: token.tokens,
            text: token.text,
            renderMath
          }
        ));
      case "codespan":
        return /* @__PURE__ */ import_react.default.createElement("code", { key, className: "redrob-inline-code" }, token.text);
      case "br":
        return /* @__PURE__ */ import_react.default.createElement("br", { key });
      case "link":
        return /* @__PURE__ */ import_react.default.createElement(
          "a",
          {
            key,
            href: token.href,
            target: "_blank",
            rel: "noreferrer noopener",
            className: "underline"
          },
          /* @__PURE__ */ import_react.default.createElement(
            InlineTokens,
            {
              tokens: token.tokens,
              text: token.text,
              renderMath
            }
          )
        );
      case "image":
        return /* @__PURE__ */ import_react.default.createElement(
          "img",
          {
            key,
            src: token.href,
            alt: token.text,
            className: "max-w-full rounded-lg"
          }
        );
      default:
        if (token.tokens?.length) {
          return /* @__PURE__ */ import_react.default.createElement(
            InlineTokens,
            {
              key,
              tokens: token.tokens,
              text: token.text,
              renderMath
            }
          );
        }
        return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, { key }, renderMath ? renderMath(token.text ?? "") : token.text ?? "");
    }
  }));
}
var HEADING_CLASS = {
  1: "redrob-h1",
  2: "redrob-h2",
  3: "redrob-h3"
};
function MarkdownTokens({ tokens, renderCode, renderMath }) {
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, tokens.map((token, index) => {
    const key = `${token.type}-${index}`;
    const inline = /* @__PURE__ */ import_react.default.createElement(
      InlineTokens,
      {
        tokens: token.tokens,
        text: token.text,
        renderMath
      }
    );
    switch (token.type) {
      case "space":
        return null;
      case "paragraph":
        return /* @__PURE__ */ import_react.default.createElement("p", { key }, inline);
      case "text":
        return /* @__PURE__ */ import_react.default.createElement("p", { key }, inline);
      case "heading": {
        const Tag = `h${Math.min(token.depth + 2, 6)}`;
        return /* @__PURE__ */ import_react.default.createElement(
          Tag,
          {
            key,
            className: HEADING_CLASS[token.depth] ?? "redrob-h3"
          },
          inline
        );
      }
      case "code":
        return renderCode(token, key);
      case "blockquote":
        return /* @__PURE__ */ import_react.default.createElement("blockquote", { key, className: "redrob-blockquote" }, /* @__PURE__ */ import_react.default.createElement(
          MarkdownTokens,
          {
            tokens: token.tokens ?? [],
            renderCode,
            renderMath
          }
        ));
      case "list": {
        const Tag = token.ordered ? "ol" : "ul";
        return /* @__PURE__ */ import_react.default.createElement(
          Tag,
          {
            key,
            className: token.ordered ? "redrob-ol" : "redrob-ul",
            start: token.ordered && token.start ? token.start : void 0
          },
          token.items.map((item, itemIndex) => /* @__PURE__ */ import_react.default.createElement("li", { key: `${key}-${itemIndex}` }, item.task ? (
            // A rendered task marker, not a control: it reflects
            // "- [x]" in the text and cannot be toggled. readOnly
            // still leaves it in the tab order, so a long reply
            // became a row of dead tab stops. disabled is the
            // convention for a non-editable task list.
            /* @__PURE__ */ import_react.default.createElement(
              "input",
              {
                type: "checkbox",
                checked: Boolean(item.checked),
                disabled: true,
                className: "mr-1.5 align-middle"
              }
            )
          ) : null, /* @__PURE__ */ import_react.default.createElement(
            MarkdownTokens,
            {
              tokens: item.tokens ?? [],
              renderCode,
              renderMath
            }
          )))
        );
      }
      case "table":
        return /* @__PURE__ */ import_react.default.createElement("div", { key, className: "overflow-x-auto" }, /* @__PURE__ */ import_react.default.createElement("table", { className: "redrob-table" }, /* @__PURE__ */ import_react.default.createElement("thead", null, /* @__PURE__ */ import_react.default.createElement("tr", null, token.header.map((cell, cellIndex) => /* @__PURE__ */ import_react.default.createElement("th", { key: cellIndex, style: alignOf(token, cellIndex) }, /* @__PURE__ */ import_react.default.createElement(
          InlineTokens,
          {
            tokens: cell.tokens,
            text: cell.text,
            renderMath
          }
        ))))), /* @__PURE__ */ import_react.default.createElement("tbody", null, token.rows.map((row, rowIndex) => /* @__PURE__ */ import_react.default.createElement("tr", { key: rowIndex }, row.map((cell, cellIndex) => /* @__PURE__ */ import_react.default.createElement("td", { key: cellIndex, style: alignOf(token, cellIndex) }, /* @__PURE__ */ import_react.default.createElement(
          InlineTokens,
          {
            tokens: cell.tokens,
            text: cell.text,
            renderMath
          }
        ))))))));
      case "hr":
        return /* @__PURE__ */ import_react.default.createElement("hr", { key, className: "redrob-hr" });
      // Raw HTML from the model is shown as text, never parsed.
      case "html":
        return /* @__PURE__ */ import_react.default.createElement("p", { key, className: "whitespace-pre-wrap" }, token.text);
      default:
        return token.raw ? /* @__PURE__ */ import_react.default.createElement("p", { key, className: "whitespace-pre-wrap" }, token.raw) : null;
    }
  }));
}
function alignOf(token, index) {
  const align = token.align?.[index];
  return align ? { textAlign: align } : void 0;
}

// node_modules/marked/lib/marked.esm.js
function C() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var R = C();
function j(l3) {
  R = l3;
}
var z = { exec: () => null };
function A(l3) {
  let e = [];
  return (t) => {
    let n = Math.max(0, Math.min(3, t - 1)), s = e[n];
    return s || (s = l3(n), e[n] = s), s;
  };
}
function d(l3, e = "") {
  let t = typeof l3 == "string" ? l3 : l3.source, n = { replace: (s, r) => {
    let i = typeof r == "string" ? r : r.source;
    return i = i.replace(m.caret, "$1"), t = t.replace(s, i), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var Te = ((l3 = "") => {
  try {
    return !!new RegExp("(?<=1)(?<!1)" + l3);
  } catch {
    return false;
  }
})();
var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l3) => new RegExp(`^( {0,3}${l3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: A((l3) => new RegExp(`^ {0,${l3}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)), hrRegex: A((l3) => new RegExp(`^ {0,${l3}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`)), fencesBeginRegex: A((l3) => new RegExp(`^ {0,${l3}}(?:\`\`\`|~~~)`)), headingBeginRegex: A((l3) => new RegExp(`^ {0,${l3}}#`)), htmlBeginRegex: A((l3) => new RegExp(`^ {0,${l3}}<(?:[a-z].*>|!--)`, "i")), blockquoteBeginRegex: A((l3) => new RegExp(`^ {0,${l3}}>`)) };
var Oe = /^(?:[ \t]*(?:\n|$))+/;
var we = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var ye = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var q = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var Pe = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var U = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
var oe = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var ae = d(oe).replace(/bull/g, U).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var Se = d(oe).replace(/bull/g, U).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var K = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/;
var _e = /^[^\n]+/;
var W = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var $e = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", W).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var Le = d(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, U).getRegex();
var Q = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var X = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var Me = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", X).replace("tag", Q).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var le = (l3) => d(K).replace("hr", q).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", l3).replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Q).getRegex();
var ze = le(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/);
var Ee = le(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/);
var Ce = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", Ee).getRegex();
var J = { blockquote: Ce, code: we, def: $e, fences: ye, heading: Pe, hr: q, html: Me, lheading: ae, list: Le, newline: Oe, paragraph: ze, table: z, text: _e };
var se = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", q).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Q).getRegex();
var Ae = { ...J, lheading: Se, table: se, paragraph: d(K).replace("hr", q).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", se).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", Q).getRegex() };
var Ie = { ...J, html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", X).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: z, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d(K).replace("hr", q).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ae).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Be = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var De = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var pe = /^( {2,}|\\)\n(?!\s*$)/;
var qe = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var _ = /[\p{P}\p{S}]/u;
var I = /[\s\p{P}\p{S}]/u;
var v = /[^\s\p{P}\p{S}]/u;
var ve = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, I).getRegex();
var He = /[\p{Pi}\p{Ps}"']/u;
var ue = /(?!~)[\p{P}\p{S}]/u;
var Ze = /(?!~)[\s\p{P}\p{S}]/u;
var Ge = /(?:[^\s\p{P}\p{S}]|~)/u;
var Qe = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Te ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var ce = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
var Ne = d(ce, "u").replace(/punct/g, _).getRegex();
var je = d(ce, "u").replace(/punct/g, ue).getRegex();
var Fe = /^(?:\*+(?:((?!\*)(?!openQuote)punct)|([^\s*]))?)|^_+(?:((?!_)(?!openQuote)punct)|([^\s_]))?/;
var Ue = d(Fe, "u").replace(/openQuote/g, He).replace(/punct/g, _).getRegex();
var he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Ke = d(he, "gu").replace(/notPunctSpace/g, v).replace(/punctSpace/g, I).replace(/punct/g, _).getRegex();
var We = d(he, "gu").replace(/notPunctSpace/g, Ge).replace(/punctSpace/g, Ze).replace(/punct/g, ue).getRegex();
var Xe = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)[\\s](\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|(?:(?!\\*)punct|notPunctSpace)(\\*+)(?!\\*)(?=notPunctSpace)";
var Je = d(Xe, "gu").replace(/notPunctSpace/g, v).replace(/punctSpace/g, I).replace(/punct/g, _).getRegex();
var Ve = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, v).replace(/punctSpace/g, I).replace(/punct/g, _).getRegex();
var Ye = "^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)[\\s](_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)|(?:(?!_)punct|notPunctSpace)(_+)(?!_)(?=notPunctSpace)";
var et = d(Ye, "gu").replace(/notPunctSpace/g, v).replace(/punctSpace/g, I).replace(/punct/g, _).getRegex();
var tt = d(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, _).getRegex();
var nt = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
var rt = d(nt, "gu").replace(/notPunctSpace/g, v).replace(/punctSpace/g, I).replace(/punct/g, _).getRegex();
var st = d(/\\(punct)/, "gu").replace(/punct/g, _).getRegex();
var it = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var ot = d(X).replace("(?:-->|$)", "-->").getRegex();
var at = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", ot).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var G = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/;
var lt = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", G).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var de = d(/^!?\[(label)\]\[(ref)\]/).replace("label", G).replace("ref", W).getRegex();
var ke = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", W).getRegex();
var pt = d("reflink|nolink(?!\\()", "g").replace("reflink", de).replace("nolink", ke).getRegex();
var ie = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var V = { _backpedal: z, anyPunctuation: st, autolink: it, blockSkip: Qe, br: pe, code: De, del: z, delLDelim: z, delRDelim: z, emStrongLDelim: Ne, emStrongRDelimAst: Ke, emStrongRDelimUnd: Ve, escape: Be, link: lt, nolink: ke, punctuation: ve, reflink: de, reflinkSearch: pt, tag: at, text: qe, url: z };
var ut = { ...V, emStrongLDelim: Ue, emStrongRDelimAst: Je, emStrongRDelimUnd: et, link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", G).getRegex(), reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", G).getRegex() };
var F = { ...V, emStrongRDelimAst: We, emStrongLDelim: je, delLDelim: tt, delRDelim: rt, url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ie).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d(/^(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ie).getRegex() };
var ct = { ...F, br: d(pe).replace("{2,}", "*").getRegex(), text: d(F.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var H = { normal: J, gfm: Ae, pedantic: Ie };
var B = { normal: V, gfm: F, breaks: ct, pedantic: ut };
var ht = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var ge = (l3) => ht[l3];
function O(l3, e) {
  if (e) {
    if (m.escapeTest.test(l3)) return l3.replace(m.escapeReplace, ge);
  } else if (m.escapeTestNoEncode.test(l3)) return l3.replace(m.escapeReplaceNoEncode, ge);
  return l3;
}
function Y(l3) {
  try {
    l3 = encodeURI(l3).replace(m.percentDecode, "%");
  } catch {
    return null;
  }
  return l3;
}
function ee(l3, e) {
  let t = l3.replace(m.findPipe, (r, i, o) => {
    let p = false, a = i;
    for (; --a >= 0 && o[a] === "\\"; ) p = !p;
    return p ? "|" : " |";
  }), n = t.split(m.splitPipe), s = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
  else for (; n.length < e; ) n.push("");
  for (; s < n.length; s++) n[s] = n[s].trim().replace(m.slashPipe, "|");
  return n;
}
function $(l3, e, t) {
  let n = l3.length;
  if (n === 0) return "";
  let s = 0;
  for (; s < n; ) {
    let r = l3.charAt(n - s - 1);
    if (r === e && !t) s++;
    else if (r !== e && t) s++;
    else break;
  }
  return l3.slice(0, n - s);
}
function te(l3) {
  let e = l3.split(`
`), t = e.length - 1;
  for (; t >= 0 && m.blankLine.test(e[t]); ) t--;
  return e.length - t <= 2 ? l3 : e.slice(0, t + 1).join(`
`);
}
function fe(l3, e) {
  if (l3.indexOf(e[1]) === -1) return -1;
  let t = 0;
  for (let n = 0; n < l3.length; n++) if (l3[n] === "\\") n++;
  else if (l3[n] === e[0]) t++;
  else if (l3[n] === e[1] && (t--, t < 0)) return n;
  return t > 0 ? -2 : -1;
}
function me(l3, e = 0) {
  let t = e, n = "";
  for (let s of l3) if (s === "	") {
    let r = 4 - t % 4;
    n += " ".repeat(r), t += r;
  } else n += s, t++;
  return n;
}
function xe(l3, e, t, n, s) {
  let r = e.href, i = e.title || null, o = l3[1].replace(s.other.outputLinkReplace, "$1");
  n.state.inLink = true;
  let p = { type: l3[0].charAt(0) === "!" ? "image" : "link", raw: t, href: r, title: i, text: o, tokens: n.inlineTokens(o) };
  return n.state.inLink = false, p;
}
function dt(l3, e, t) {
  let n = l3.match(t.other.indentCodeCompensation);
  if (n === null) return e;
  let s = n[1];
  return e.split(`
`).map((r) => {
    let i = r.match(t.other.beginningSpace);
    if (i === null) return r;
    let [o] = i;
    return o.length >= s.length ? r.slice(s.length) : r;
  }).join(`
`);
}
var y = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || R;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0) return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = this.options.pedantic ? t[0] : te(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: n, codeBlockStyle: "indented", text: s };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], s = dt(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: s };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let s = $(n, "#");
        (this.options.pedantic || !s || this.rules.other.endingSpaceChar.test(s)) && (n = s.trim());
      }
      return { type: "heading", raw: $(t[0], `
`), depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t) return { type: "hr", raw: $(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = $(t[0], `
`).split(`
`), s = "", r = "", i = [];
      for (; n.length > 0; ) {
        let o = false, p = [], a;
        for (a = 0; a < n.length; a++) if (this.rules.other.blockquoteStart.test(n[a])) p.push(n[a]), o = true;
        else if (!o) p.push(n[a]);
        else break;
        n = n.slice(a);
        let u = p.join(`
`), c = u.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        s = s ? `${s}
${u}` : u, r = r ? `${r}
${c}` : c;
        let h2 = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(c, i, true), this.lexer.state.top = h2, n.length === 0) break;
        let k = i.at(-1);
        if (k?.type === "code") break;
        if (k?.type === "blockquote") {
          let T = k, g = n.join(`
`), w = T.raw + `
` + g.replace(this.rules.other.blockquoteSetextReplace2, ""), M = this.blockquote(w);
          i[i.length - 1] = M, s = `${s}
${g}`, r = r.substring(0, r.length - T.text.length) + M.text;
          break;
        } else if (k?.type === "list") {
          let T = k, g = T.raw + `
` + n.join(`
`), w = this.list(g);
          i[i.length - 1] = w, s = s.substring(0, s.length - k.raw.length) + w.raw, r = r.substring(0, r.length - T.raw.length) + w.raw, n = g.substring(i.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: s, tokens: i, text: r };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), s = n.length > 1, r = { type: "list", raw: "", ordered: s, start: s ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
      let i = this.rules.other.listItemRegex(n), o = false;
      for (; e; ) {
        let a = false, u = "", c = "";
        if (!(t = i.exec(e)) || this.rules.block.hr.test(e)) break;
        u = t[0], e = e.substring(u.length);
        let h2 = me(t[2].split(`
`, 1)[0], t[1].length), k = e.split(`
`, 1)[0], T = !h2.trim(), g = 0;
        if (this.options.pedantic ? (g = 2, c = h2.trimStart()) : T ? g = t[1].length + 1 : (g = h2.search(this.rules.other.nonSpaceChar), g = g > 4 ? 1 : g, c = h2.slice(g), g += t[1].length), T && this.rules.other.blankLine.test(k) && (u += k + `
`, e = e.substring(k.length + 1), a = true), !a) {
          let w = this.rules.other.nextBulletRegex(g), M = this.rules.other.hrRegex(g), ne = this.rules.other.fencesBeginRegex(g), re = this.rules.other.headingBeginRegex(g), be = this.rules.other.htmlBeginRegex(g), Re = this.rules.other.blockquoteBeginRegex(g);
          for (; e; ) {
            let N = e.split(`
`, 1)[0], D;
            if (k = N, this.options.pedantic ? (k = k.replace(this.rules.other.listReplaceNesting, "  "), D = k) : D = k.replace(this.rules.other.tabCharGlobal, "    "), ne.test(k) || re.test(k) || be.test(k) || Re.test(k) || w.test(k) || M.test(k)) break;
            if (D.search(this.rules.other.nonSpaceChar) >= g || !k.trim()) c += `
` + D.slice(g);
            else {
              if (T || h2.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || ne.test(h2) || re.test(h2) || M.test(h2)) break;
              c += `
` + k;
            }
            T = !k.trim(), u += N + `
`, e = e.substring(N.length + 1), h2 = D.slice(g);
          }
        }
        r.loose || (o ? r.loose = true : this.rules.other.doubleBlankLine.test(u) && (o = true)), r.items.push({ type: "list_item", raw: u, task: !!this.options.gfm && this.rules.other.listIsTask.test(c), loose: false, text: c, tokens: [] }), r.raw += u;
      }
      let p = r.items.at(-1);
      if (p) p.raw = p.raw.trimEnd(), p.text = p.text.trimEnd();
      else return;
      r.raw = r.raw.trimEnd();
      for (let a of r.items) if (this.lexer.state.top = false, a.tokens = this.lexer.blockTokens(a.text, []), !r.loose) {
        let u = a.tokens.filter((h2) => h2.type === "space"), c = u.length > 0 && u.some((h2) => this.rules.other.anyLine.test(h2.raw));
        r.loose = c;
      }
      for (let a of r.items) {
        let u = a.tokens[0];
        if (a.task && (u?.type === "text" || u?.type === "paragraph")) {
          a.text = a.text.replace(this.rules.other.listReplaceTask, ""), u.raw = u.raw.replace(this.rules.other.listReplaceTask, ""), u.text = u.text.replace(this.rules.other.listReplaceTask, "");
          for (let h2 = this.lexer.inlineQueue.length - 1; h2 >= 0; h2--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[h2].src)) {
            this.lexer.inlineQueue[h2].src = this.lexer.inlineQueue[h2].src.replace(this.rules.other.listReplaceTask, "");
            break;
          }
          let c = this.rules.other.listTaskCheckbox.exec(a.raw);
          if (c) {
            let h2 = { type: "checkbox", raw: c[0] + " ", checked: c[0] !== "[ ]" };
            a.checked = h2.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = h2.raw + a.tokens[0].raw, a.tokens[0].text = h2.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(h2)) : a.tokens.unshift({ type: "paragraph", raw: h2.raw, text: h2.raw, tokens: [h2] }) : a.tokens.unshift(h2);
          }
        } else a.task && (a.task = false);
      }
      if (r.loose) for (let a of r.items) {
        a.loose = true;
        for (let u of a.tokens) u.type === "text" && (u.type = "paragraph");
      }
      return r;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t) {
      let n = te(t[0]);
      return { type: "html", block: true, raw: n, pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: n };
    }
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: $(t[0], `
`), href: s, title: r };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
    let n = ee(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i = { type: "table", raw: $(t[0], `
`), header: [], align: [], rows: [] };
    if (n.length === s.length) {
      for (let o of s) this.rules.other.tableAlignRight.test(o) ? i.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i.align.push("left") : i.align.push(null);
      for (let o = 0; o < n.length; o++) i.header.push({ text: n[o], tokens: this.lexer.inline(n[o]), header: true, align: i.align[o] });
      for (let o of r) i.rows.push(ee(o, i.header.length).map((p, a) => ({ text: p, tokens: this.lexer.inline(p), header: false, align: i.align[a] })));
      return i;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t) {
      let n = t[1].trim();
      return { type: "heading", raw: $(t[0], `
`), depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
    }
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t) return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n)) return;
        let i = $(n.slice(0, -1), "\\");
        if ((n.length - i.length) % 2 === 0) return;
      } else {
        let i = fe(t[2], "()");
        if (i === -2) return;
        if (i > -1) {
          let p = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
          t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, p).trim(), t[3] = "";
        }
      }
      let s = t[2], r = "";
      if (this.options.pedantic) {
        let i = this.rules.other.pedanticHrefTitle.exec(s);
        i && (s = i[1], r = i[3]);
      } else r = t[3] ? t[3].slice(1, -1) : "";
      return s = s.trim(), this.rules.other.startAngleBracket.test(s) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? s = s.slice(1) : s = s.slice(1, -1)), xe(t, { href: s && s.replace(this.rules.inline.anyPunctuation, "$1"), title: r && r.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let s = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r = t[s.toLowerCase()];
      if (!r) {
        let i = n[0].charAt(0);
        return { type: "text", raw: i, text: i };
      }
      return xe(n, r, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let s = this.rules.inline.emStrongLDelim.exec(e);
    if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let i = [...s[0]].length - 1, o, p, a = i, u = 0, c = s[0][0], h2 = n === c, k = c === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (k.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = k.exec(t)) !== null; ) {
        if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o) continue;
        if (p = [...o].length, s[3] || s[4]) {
          a += p;
          continue;
        } else if (s[5] || s[6]) {
          if (i % 3 && !((i + p) % 3)) {
            u += p;
            continue;
          }
          if (h2) break;
        }
        if (a -= p, a > 0) continue;
        p = Math.min(p, p + a + u);
        let T = [...s[0]][0].length, g = e.slice(0, i + s.index + T + p);
        if (Math.min(i, p) % 2) {
          let M = g.slice(1, -1);
          return { type: "em", raw: g, text: M, tokens: this.lexer.inlineTokens(M) };
        }
        let w = g.slice(2, -2);
        return { type: "strong", raw: g, text: w, tokens: this.lexer.inlineTokens(w) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return s && r && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t) return { type: "br", raw: t[0] };
  }
  del(e, t, n = "") {
    let s = this.rules.inline.delLDelim.exec(e);
    if (!s) return;
    if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let i = [...s[0]].length - 1, o, p, a = i, u = this.rules.inline.delRDelim;
      for (u.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = u.exec(t)) !== null; ) {
        if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o || (p = [...o].length, p !== i)) continue;
        if (s[3] || s[4]) {
          a += p;
          continue;
        }
        if (a -= p, a > 0) continue;
        p = Math.min(p, p + a);
        let c = [...s[0]][0].length, h2 = e.slice(0, i + s.index + c + p), k = h2.slice(i, -i);
        return { type: "del", raw: h2, text: k, tokens: this.lexer.inlineTokens(k) };
      }
    }
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, s;
      return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, s;
      if (t[2] === "@") n = t[0], s = "mailto:" + n;
      else {
        let r;
        do
          r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (r !== t[0]);
        n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: t[0], escaped: n };
    }
  }
};
var x = class l {
  tokens;
  options;
  state;
  inlineQueue;
  tokenizer;
  constructor(e) {
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || R, this.options.tokenizer = this.options.tokenizer || new y(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t = { other: m, block: H.normal, inline: B.normal };
    this.options.pedantic ? (t.block = H.pedantic, t.inline = B.pedantic) : this.options.gfm && (t.block = H.gfm, this.options.breaks ? t.inline = B.breaks : t.inline = B.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: H, inline: B };
  }
  static lex(e, t) {
    return new l(t).lex(e);
  }
  static lexInline(e, t) {
    return new l(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0; t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));
    let s = 1 / 0;
    for (; e; ) {
      if (e.length < s) s = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      let r;
      if (this.options.extensions?.block?.some((o) => (r = o.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        r.raw.length === 1 && o !== void 0 ? o.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.at(-1).src = o.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.raw, this.inlineQueue.at(-1).src = o.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let i = e;
      if (this.options.extensions?.startBlock) {
        let o = 1 / 0, p = e.slice(1), a;
        this.options.extensions.startBlock.forEach((u) => {
          a = u.call({ lexer: this }, p), typeof a == "number" && a >= 0 && (o = Math.min(o, a));
        }), o < 1 / 0 && o >= 0 && (i = e.substring(0, o + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(i))) {
        let o = t.at(-1);
        n && o?.type === "paragraph" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  inlineTokens(e, t = []) {
    this.tokenizer.lexer = this;
    let n = e;
    if (this.tokens.links) {
      let o = Object.keys(this.tokens.links);
      o.length > 0 && (n = n.replace(this.tokenizer.rules.inline.reflinkSearch, (p) => o.includes(p.slice(p.lastIndexOf("[") + 1, -1)) ? "[" + "a".repeat(p.length - 2) + "]" : p));
    }
    n = n.replace(this.tokenizer.rules.inline.anyPunctuation, (o) => "+".repeat(o.length)), n = n.replace(this.tokenizer.rules.inline.blockSkip, (o, p, a) => {
      let u = a ? a.length : 0;
      return o.slice(0, u) + "[" + "a".repeat(o.length - u - 2) + "]";
    }), n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let s = false, r = "", i = 1 / 0;
    for (; e; ) {
      if (e.length < i) i = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      s || (r = ""), s = false;
      let o;
      if (this.options.extensions?.inline?.some((a) => (o = a.call({ lexer: this }, e, t)) ? (e = e.substring(o.raw.length), t.push(o), true) : false)) continue;
      if (o = this.tokenizer.escape(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.tag(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.link(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(o.raw.length);
        let a = t.at(-1);
        o.type === "text" && a?.type === "text" ? (a.raw += o.raw, a.text += o.text) : t.push(o);
        continue;
      }
      if (o = this.tokenizer.emStrong(e, n, r)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.codespan(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.br(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.del(e, n, r)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.autolink(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (!this.state.inLink && (o = this.tokenizer.url(e))) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      let p = e;
      if (this.options.extensions?.startInline) {
        let a = 1 / 0, u = e.slice(1), c;
        this.options.extensions.startInline.forEach((h2) => {
          c = h2.call({ lexer: this }, u), typeof c == "number" && c >= 0 && (a = Math.min(a, c));
        }), a < 1 / 0 && a >= 0 && (p = e.substring(0, a + 1));
      }
      if (o = this.tokenizer.inlineText(p)) {
        e = e.substring(o.raw.length), o.raw.slice(-1) !== "_" && (r = o.raw.slice(-1)), s = true;
        let a = t.at(-1);
        a?.type === "text" ? (a.raw += o.raw, a.text += o.text) : t.push(o);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return t;
  }
  infiniteLoopError(e) {
    let t = "Infinite loop on byte: " + e;
    if (this.options.silent) console.error(t);
    else throw new Error(t);
  }
};
var P = class {
  options;
  parser;
  constructor(e) {
    this.options = e || R;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let s = (t || "").match(m.notSpaceStart)?.[0], r = e.replace(m.endingNewline, "") + `
`;
    return s ? '<pre><code class="language-' + O(s) + '">' + (n ? r : O(r, true)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let t = e.ordered, n = e.start, s = "";
    for (let o = 0; o < e.items.length; o++) {
      let p = e.items[o];
      s += this.listitem(p);
    }
    let r = t ? "ol" : "ul", i = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + r + i + `>
` + s + "</" + r + `>
`;
  }
  listitem(e) {
    return `<li>${this.parser.parse(e.tokens)}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let r = 0; r < e.header.length; r++) n += this.tablecell(e.header[r]);
    t += this.tablerow({ text: n });
    let s = "";
    for (let r = 0; r < e.rows.length; r++) {
      let i = e.rows[r];
      n = "";
      for (let o = 0; o < i.length; o++) n += this.tablecell(i[o]);
      s += this.tablerow({ text: n });
    }
    return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${O(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, tokens: n }) {
    let s = this.parser.parseInline(n), r = Y(e);
    if (r === null) return s;
    e = r;
    let i = '<a href="' + e + '"';
    return t && (i += ' title="' + O(t) + '"'), i += ">" + s + "</a>", i;
  }
  image({ href: e, title: t, text: n, tokens: s }) {
    s && (n = this.parser.parseInline(s, this.parser.textRenderer));
    let r = Y(e);
    if (r === null) return O(n);
    e = r;
    let i = `<img src="${e}" alt="${O(n)}"`;
    return t && (i += ` title="${O(t)}"`), i += ">", i;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text);
  }
};
var L = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
  checkbox({ raw: e }) {
    return e;
  }
};
var b = class l2 {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || R, this.options.renderer = this.options.renderer || new P(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L();
  }
  static parse(e, t) {
    return new l2(t).parse(e);
  }
  static parseInline(e, t) {
    return new l2(t).parseInline(e);
  }
  parse(e) {
    this.renderer.parser = this;
    let t = "";
    for (let n = 0; n < e.length; n++) {
      let s = e[n];
      if (this.options.extensions?.renderers?.[s.type]) {
        let i = s, o = this.options.extensions.renderers[i.type].call({ parser: this }, i);
        if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "checkbox", "html", "def", "paragraph", "text"].includes(i.type)) {
          t += o || "";
          continue;
        }
      }
      let r = s;
      switch (r.type) {
        case "space": {
          t += this.renderer.space(r);
          break;
        }
        case "hr": {
          t += this.renderer.hr(r);
          break;
        }
        case "heading": {
          t += this.renderer.heading(r);
          break;
        }
        case "code": {
          t += this.renderer.code(r);
          break;
        }
        case "table": {
          t += this.renderer.table(r);
          break;
        }
        case "blockquote": {
          t += this.renderer.blockquote(r);
          break;
        }
        case "list": {
          t += this.renderer.list(r);
          break;
        }
        case "checkbox": {
          t += this.renderer.checkbox(r);
          break;
        }
        case "html": {
          t += this.renderer.html(r);
          break;
        }
        case "def": {
          t += this.renderer.def(r);
          break;
        }
        case "paragraph": {
          t += this.renderer.paragraph(r);
          break;
        }
        case "text": {
          t += this.renderer.text(r);
          break;
        }
        default: {
          let i = 'Token with "' + r.type + '" type was not found.';
          if (this.options.silent) return console.error(i), "";
          throw new Error(i);
        }
      }
    }
    return t;
  }
  parseInline(e, t = this.renderer) {
    this.renderer.parser = this;
    let n = "";
    for (let s = 0; s < e.length; s++) {
      let r = e[s];
      if (this.options.extensions?.renderers?.[r.type]) {
        let o = this.options.extensions.renderers[r.type].call({ parser: this }, r);
        if (o !== false || !["escape", "html", "link", "image", "checkbox", "strong", "em", "codespan", "br", "del", "text"].includes(r.type)) {
          n += o || "";
          continue;
        }
      }
      let i = r;
      switch (i.type) {
        case "escape": {
          n += t.text(i);
          break;
        }
        case "html": {
          n += t.html(i);
          break;
        }
        case "link": {
          n += t.link(i);
          break;
        }
        case "image": {
          n += t.image(i);
          break;
        }
        case "checkbox": {
          n += t.checkbox(i);
          break;
        }
        case "strong": {
          n += t.strong(i);
          break;
        }
        case "em": {
          n += t.em(i);
          break;
        }
        case "codespan": {
          n += t.codespan(i);
          break;
        }
        case "br": {
          n += t.br(i);
          break;
        }
        case "del": {
          n += t.del(i);
          break;
        }
        case "text": {
          n += t.text(i);
          break;
        }
        default: {
          let o = 'Token with "' + i.type + '" type was not found.';
          if (this.options.silent) return console.error(o), "";
          throw new Error(o);
        }
      }
    }
    return n;
  }
};
var S = class {
  options;
  block;
  constructor(e) {
    this.options = e || R;
  }
  static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer(e = this.block) {
    return e ? x.lex : x.lexInline;
  }
  provideParser(e = this.block) {
    return e ? b.parse : b.parseInline;
  }
};
var Z = class {
  defaults = C();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = b;
  Renderer = P;
  TextRenderer = L;
  Lexer = x;
  Tokenizer = y;
  Hooks = S;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let s of e) switch (n = n.concat(t.call(this, s)), s.type) {
      case "table": {
        let r = s;
        for (let i of r.header) n = n.concat(this.walkTokens(i.tokens, t));
        for (let i of r.rows) for (let o of i) n = n.concat(this.walkTokens(o.tokens, t));
        break;
      }
      case "list": {
        let r = s;
        n = n.concat(this.walkTokens(r.items, t));
        break;
      }
      default: {
        let r = s;
        this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach((i) => {
          let o = r[i].flat(1 / 0);
          n = n.concat(this.walkTokens(o, t));
        }) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
      }
    }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let s = { ...n };
      if (s.async = this.defaults.async || s.async || false, n.extensions && (n.extensions.forEach((r) => {
        if (!r.name) throw new Error("extension name required");
        if ("renderer" in r) {
          let i = t.renderers[r.name];
          i ? t.renderers[r.name] = function(...o) {
            let p = r.renderer.apply(this, o);
            return p === false && (p = i.apply(this, o)), p;
          } : t.renderers[r.name] = r.renderer;
        }
        if ("tokenizer" in r) {
          if (!r.level || r.level !== "block" && r.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let i = t[r.level];
          i ? i.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
        }
        "childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens);
      }), s.extensions = t), n.renderer) {
        let r = this.defaults.renderer || new P(this.defaults);
        for (let i in n.renderer) {
          if (!(i in r)) throw new Error(`renderer '${i}' does not exist`);
          if (["options", "parser"].includes(i)) continue;
          let o = i, p = n.renderer[o], a = r[o];
          r[o] = (...u) => {
            let c = p.apply(r, u);
            return c === false && (c = a.apply(r, u)), c || "";
          };
        }
        s.renderer = r;
      }
      if (n.tokenizer) {
        let r = this.defaults.tokenizer || new y(this.defaults);
        for (let i in n.tokenizer) {
          if (!(i in r)) throw new Error(`tokenizer '${i}' does not exist`);
          if (["options", "rules", "lexer"].includes(i)) continue;
          let o = i, p = n.tokenizer[o], a = r[o];
          r[o] = (...u) => {
            let c = p.apply(r, u);
            return c === false && (c = a.apply(r, u)), c;
          };
        }
        s.tokenizer = r;
      }
      if (n.hooks) {
        let r = this.defaults.hooks || new S();
        for (let i in n.hooks) {
          if (!(i in r)) throw new Error(`hook '${i}' does not exist`);
          if (["options", "block"].includes(i)) continue;
          let o = i, p = n.hooks[o], a = r[o];
          S.passThroughHooks.has(i) ? r[o] = (u) => {
            if (this.defaults.async && S.passThroughHooksRespectAsync.has(i)) return (async () => {
              let h2 = await p.call(r, u);
              return a.call(r, h2);
            })();
            let c = p.call(r, u);
            return a.call(r, c);
          } : r[o] = (...u) => {
            if (this.defaults.async) return (async () => {
              let h2 = await p.apply(r, u);
              return h2 === false && (h2 = await a.apply(r, u)), h2;
            })();
            let c = p.apply(r, u);
            return c === false && (c = a.apply(r, u)), c;
          };
        }
        s.hooks = r;
      }
      if (n.walkTokens) {
        let r = this.defaults.walkTokens, i = n.walkTokens;
        s.walkTokens = function(o) {
          let p = [];
          return p.push(i.call(this, o)), r && (p = p.concat(r.call(this, o))), p;
        };
      }
      this.defaults = { ...this.defaults, ...s };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return x.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return b.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, s) => {
      let r = { ...s }, i = { ...this.defaults, ...r }, o = this.onError(!!i.silent, !!i.async);
      if (this.defaults.async === true && r.async === false) return o(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null) return o(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string") return o(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (i.hooks && (i.hooks.options = i, i.hooks.block = e), i.async) return (async () => {
        let p = i.hooks ? await i.hooks.preprocess(n) : n, u = await (i.hooks ? await i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(p, i), c = i.hooks ? await i.hooks.processAllTokens(u) : u;
        i.walkTokens && await Promise.all(this.walkTokens(c, i.walkTokens));
        let k = await (i.hooks ? await i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(c, i);
        return i.hooks ? await i.hooks.postprocess(k) : k;
      })().catch(o);
      try {
        i.hooks && (n = i.hooks.preprocess(n));
        let a = (i.hooks ? i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, i);
        i.hooks && (a = i.hooks.processAllTokens(a)), i.walkTokens && this.walkTokens(a, i.walkTokens);
        let c = (i.hooks ? i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(a, i);
        return i.hooks && (c = i.hooks.postprocess(c)), c;
      } catch (p) {
        return o(p);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let s = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(s) : s;
      }
      if (t) return Promise.reject(n);
      throw n;
    };
  }
};
var E = new Z();
function f(l3, e) {
  return E.parse(l3, e);
}
f.options = f.setOptions = function(l3) {
  return E.setOptions(l3), f.defaults = E.defaults, j(f.defaults), f;
};
f.getDefaults = C;
f.defaults = R;
function kt(...l3) {
  return E.use(...l3), f.defaults = E.defaults, j(f.defaults), f;
}
f.use = kt;
f.walkTokens = function(l3, e) {
  return E.walkTokens(l3, e);
};
f.parseInline = E.parseInline;
f.Parser = b;
f.parser = b.parse;
f.Renderer = P;
f.TextRenderer = L;
f.Lexer = x;
f.lexer = x.lex;
f.Tokenizer = y;
f.Hooks = S;
f.parse = f;
var nn = f.options;
var rn = f.setOptions;
var sn = f.walkTokens;
var on = f.parseInline;
var ln = b.parse;
var pn = x.lex;

// src/chat/markdown-tokens.js
function tokenizeMarkdown(text) {
  return f.lexer(text ?? "", { gfm: true, breaks: true });
}
function splitMath(text) {
  return text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g).filter((part) => part !== "");
}

// src/chat/rich-message.jsx
function MermaidBlock({ source }) {
  const id = (0, react_exports.useId)().replaceAll(":", "");
  const [svg2, setSvg] = (0, react_exports.useState)("");
  const [error, setError] = (0, react_exports.useState)("");
  (0, react_exports.useEffect)(() => {
    let active = true;
    void import("./mermaid-SM2PW4U5.js").then(async ({ mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      const rendered = await mermaid.render(`redrob-mermaid-${id}`, source);
      if (active) setSvg(rendered.svg);
    }).catch((reason) => {
      if (active) setError(String(reason));
    });
    return () => {
      active = false;
    };
  }, [id, source]);
  if (error) return /* @__PURE__ */ import_react.default.createElement("pre", { className: "text-danger-200" }, error);
  return /* @__PURE__ */ import_react.default.createElement(
    "div",
    {
      className: "redrob-mermaid overflow-x-auto",
      dangerouslySetInnerHTML: { __html: svg2 }
    }
  );
}
function MathBlock({ source, displayMode }) {
  const [html, setHtml] = (0, react_exports.useState)("");
  (0, react_exports.useEffect)(() => {
    let active = true;
    void import("./katex-MCFCOTQE.js").then(({ katex }) => {
      const rendered = katex.renderToString(source, {
        displayMode,
        throwOnError: false,
        strict: "ignore"
      });
      if (active) setHtml(rendered);
    });
    return () => {
      active = false;
    };
  }, [displayMode, source]);
  return /* @__PURE__ */ import_react.default.createElement(
    "span",
    {
      className: displayMode ? "redrob-math block overflow-x-auto" : "",
      dangerouslySetInnerHTML: { __html: html }
    }
  );
}
function CytoscapeBlock({ source }) {
  const rootRef = (0, react_exports.useRef)(null);
  const [error, setError] = (0, react_exports.useState)("");
  (0, react_exports.useEffect)(() => {
    let graph;
    try {
      const elements = JSON.parse(source);
      void import("./cytoscape-ZQ7AIDPE.js").then(({ cytoscape }) => {
        graph = cytoscape({
          container: rootRef.current,
          elements,
          layout: { name: "cose" },
          // Cytoscape paints to a canvas, which cannot read a CSS custom
          // property, so a graph carries the brand values as literals: Blue 6
          // filled with Redrob White ink, and Gray 6 for the edges, the one
          // step of the scale that clears 3:1 on both the light and the dark
          // surface. `test/design-tokens.test.mjs` pins all three.
          style: [
            {
              selector: "node",
              style: {
                label: "data(label)",
                "background-color": "#2b52ff",
                color: "#ffffff"
              }
            },
            {
              selector: "edge",
              style: {
                width: 2,
                "line-color": "#7c8390",
                "target-arrow-shape": "triangle"
              }
            }
          ]
        });
      }).catch((reason) => setError(String(reason)));
    } catch (reason) {
      setError(String(reason));
    }
    return () => graph?.destroy();
  }, [source]);
  if (error) return /* @__PURE__ */ import_react.default.createElement("pre", { className: "text-danger-200" }, error);
  return /* @__PURE__ */ import_react.default.createElement("div", { ref: rootRef, className: "h-72 w-full" });
}
function renderTextWithMath(text) {
  return splitMath(text).map((part, index) => {
    if (part.startsWith("$$") && part.endsWith("$$")) {
      return /* @__PURE__ */ import_react.default.createElement(
        MathBlock,
        {
          key: `${index}-${part}`,
          source: part.slice(2, -2),
          displayMode: true
        }
      );
    }
    if (part.startsWith("$") && part.endsWith("$")) {
      return /* @__PURE__ */ import_react.default.createElement(
        MathBlock,
        {
          key: `${index}-${part}`,
          source: part.slice(1, -1),
          displayMode: false
        }
      );
    }
    return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, { key: `${index}-${part}` }, part);
  });
}
function CodeBlock({ source, language }) {
  const [html, setHtml] = (0, react_exports.useState)(null);
  (0, react_exports.useEffect)(() => {
    let active = true;
    void import("./highlight-QSXHJWOL.js").then(({ hljs }) => {
      if (!language || !hljs.getLanguage(language)) return;
      const rendered = hljs.highlight(source, {
        language,
        ignoreIllegals: true
      }).value;
      if (active) setHtml(rendered);
    }).catch(() => {
    });
    return () => {
      active = false;
    };
  }, [language, source]);
  return /* @__PURE__ */ import_react.default.createElement("pre", { className: "redrob-code-block" }, html === null ? /* @__PURE__ */ import_react.default.createElement("code", { "data-language": language || void 0 }, source) : /* @__PURE__ */ import_react.default.createElement(
    "code",
    {
      "data-language": language,
      className: "hljs",
      dangerouslySetInnerHTML: { __html: html }
    }
  ));
}
function renderCodeToken(token, key) {
  const language = token.lang?.toLowerCase().trim();
  if (language === "mermaid") {
    return /* @__PURE__ */ import_react.default.createElement(MermaidBlock, { key, source: token.text.trim() });
  }
  if (language === "cytoscape") {
    return /* @__PURE__ */ import_react.default.createElement(CytoscapeBlock, { key, source: token.text.trim() });
  }
  return /* @__PURE__ */ import_react.default.createElement(CodeBlock, { key, source: token.text, language });
}
function RichMessage({ text }) {
  return (
    // redrob-response carries the reply typography: the serif family and, more to
    // the point, sizes for h1 and h2. The library's preflight does not reset
    // headings and theme.css only styles h3 down, so until now a "# Heading" in a
    // reply rendered at the browser's default 2em -- huge inside a chat bubble.
    // These 12 rules were written for exactly that and had never been applied to
    // anything.
    /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-markdown redrob-response" }, /* @__PURE__ */ import_react.default.createElement(
      MarkdownTokens,
      {
        tokens: tokenizeMarkdown(text),
        renderCode: renderCodeToken,
        renderMath: renderTextWithMath
      }
    ))
  );
}

// src/chat/tool-activity.jsx
var AGENT_STATE = {
  running: "running",
  done: "done",
  error: "error",
  denied: "error"
};
var STATUS_CLASS = {
  running: "redrob-tool-activity-running",
  done: "redrob-tool-activity-done",
  error: "redrob-tool-activity-error",
  denied: "redrob-tool-activity-error"
};
function ToolActivity({ message, copy }) {
  const [showRaw, setShowRaw] = (0, react_exports.useState)(false);
  const status = message.status ?? "done";
  const hasDetail = Boolean(
    message.detail || message.imageDataUrl || message.raw
  );
  return /* @__PURE__ */ import_react.default.createElement(
    AgentAction,
    {
      className: `redrob-tool-step ${STATUS_CLASS[status] ?? ""}`,
      name: message.label,
      summary: message.detail,
      state: AGENT_STATE[status] ?? "done",
      stateLabel: copy.toolStatusLabels[status]
    },
    hasDetail ? /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-tool-activity-detail" }, /* @__PURE__ */ import_react.default.createElement("code", { className: "redrob-tool-activity-name" }, message.toolName), message.imageDataUrl ? /* @__PURE__ */ import_react.default.createElement(
      "img",
      {
        src: message.imageDataUrl,
        alt: `${message.label} screenshot`,
        className: "redrob-tool-activity-image"
      }
    ) : null, message.raw ? /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement(
      Button,
      {
        variant: "ghost",
        size: "sm",
        "aria-expanded": showRaw,
        onClick: () => setShowRaw(!showRaw)
      },
      showRaw ? copy.hideRawResult : copy.rawResult
    ), showRaw ? /* @__PURE__ */ import_react.default.createElement("pre", null, message.raw) : null) : null) : null
  );
}
function runStatus(steps) {
  if (steps.some((step) => step.status === "running")) return "running";
  if (steps.some((step) => step.status === "error")) return "error";
  if (steps.some((step) => step.status === "denied")) return "denied";
  return "done";
}
function ToolRun({ steps, copy }) {
  const status = runStatus(steps);
  const running = steps.find((step) => step.status === "running");
  const failures = steps.filter(
    (step) => step.status === "error" || step.status === "denied"
  ).length;
  const heading = running ? running.label : `${copy.workedInBrowser} · ${copy.stepCount(steps.length)}`;
  return /* @__PURE__ */ import_react.default.createElement(
    AgentAction,
    {
      className: `redrob-tool-run ${STATUS_CLASS[status] ?? ""}`,
      name: heading,
      summary: failures ? copy.stepFailures(failures) : null,
      state: AGENT_STATE[status] ?? "done",
      stateLabel: copy.toolStatusLabels[status]
    },
    steps.map((step) => /* @__PURE__ */ import_react.default.createElement(ToolActivity, { key: step.id ?? step.label, message: step, copy }))
  );
}

// src/chat/message-list.jsx
function CopyButton({ text, copy }) {
  const [done, setDone] = import_react.default.useState(false);
  return /* @__PURE__ */ import_react.default.createElement(
    IconButton,
    {
      variant: "ghost",
      size: "sm",
      className: "redrob-message-copy",
      label: copy.copyMessage,
      title: done ? copy.copied : copy.copyMessage,
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
        }
      }
    },
    done ? icons.check({ width: "100%", height: "100%" }) : icons.copy({ width: "100%", height: "100%" })
  );
}
function ThinkingIndicator({ label }) {
  return /* @__PURE__ */ import_react.default.createElement("span", { className: "redrob-thinking", role: "status" }, label, /* @__PURE__ */ import_react.default.createElement("span", { "aria-hidden": "true", className: "redrob-thinking-dots" }, /* @__PURE__ */ import_react.default.createElement("i", null), /* @__PURE__ */ import_react.default.createElement("i", null), /* @__PURE__ */ import_react.default.createElement("i", null)));
}
function MessageList({ copy, onPick, isSending }) {
  const { messages } = useRedrobChatStore(import_react.default);
  const endRef = (0, react_exports.useRef)(null);
  (0, react_exports.useEffect)(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);
  if (messages.length === 0) {
    return /* @__PURE__ */ import_react.default.createElement(EmptyState, { copy, onPick, disabled: isSending });
  }
  return /* @__PURE__ */ import_react.default.createElement(
    "div",
    {
      className: "redrob-transcript flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4",
      "aria-live": "polite"
    },
    groupMessages(messages).map((entry) => {
      if (entry.kind === "toolRun") {
        return /* @__PURE__ */ import_react.default.createElement(ToolRun, { key: entry.id, steps: entry.steps, copy });
      }
      const message = entry.message;
      if (message.role === "user") {
        return /* @__PURE__ */ import_react.default.createElement(
          "article",
          {
            key: message.id,
            className: "ml-8 self-end rounded-2xl bg-bg-300 px-4 py-3 text-sm"
          },
          message.text
        );
      }
      if (message.role === "notice") {
        return /* @__PURE__ */ import_react.default.createElement(
          "p",
          {
            key: message.id,
            className: "self-center text-xs text-text-400",
            role: "status"
          },
          message.text
        );
      }
      return (
        // The mark floats rather than taking a column of its own: the
        // first lines set beside it and everything below runs the full
        // width, instead of the whole reply living in a narrow gutter.
        /* @__PURE__ */ import_react.default.createElement(
          "article",
          {
            key: message.id,
            className: `redrob-reply text-sm ${message.error ? "text-danger-000" : ""}`
          },
          /* @__PURE__ */ import_react.default.createElement(RedrobResponseMark, { streaming: message.streaming }),
          /* @__PURE__ */ import_react.default.createElement("div", null, message.text ? /* @__PURE__ */ import_react.default.createElement(RichMessage, { text: message.text }) : message.streaming ? /* @__PURE__ */ import_react.default.createElement(ThinkingIndicator, { label: copy.thinking }) : null, message.text && !message.streaming ? /* @__PURE__ */ import_react.default.createElement(CopyButton, { text: message.text, copy }) : null)
        )
      );
    }),
    /* @__PURE__ */ import_react.default.createElement("div", { ref: endRef })
  );
}

// src/chat/panel-messages.js
function installPanelMessageListener() {
  const chromeApi = globalThis.chrome;
  if (!chromeApi?.runtime?.onMessage) return () => {
  };
  const listener = (message, _sender, sendResponse) => {
    if (message?.type === "STOP_AGENT") {
      stopChatMessage();
      sendResponse({ success: true });
      return false;
    }
    if (message?.type === "close_side_panel") {
      sendResponse({ success: true });
      globalThis.close?.();
      return false;
    }
    if (message?.type === "POPULATE_INPUT_TEXT") {
      redrobChatStore.getState().setInputText(String(message.prompt ?? ""));
      sendResponse({ success: true });
      return false;
    }
    if (message?.type === "EXECUTE_TASK") {
      void runScheduledTask(message).then(() => sendResponse({ success: true })).catch(
        (error) => sendResponse({ success: false, error: String(error) })
      );
      return true;
    }
    return false;
  };
  chromeApi.runtime.onMessage.addListener(listener);
  return () => chromeApi.runtime.onMessage.removeListener(listener);
}
async function runScheduledTask(message) {
  const prompt = String(message.prompt ?? "").trim();
  if (!prompt) throw new Error("The scheduled task has no prompt.");
  const apiKey = await readStoredApiKey();
  if (!apiKey) throw new Error("No API key is configured.");
  void sendChatMessage(apiKey, prompt);
}

// src/chat/onboarding.jsx
function ShieldIcon() {
  return /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react.default.createElement(
    "path",
    {
      d: "M10 2.5 4 5v4.6c0 3.4 2.4 6.5 6 7.9 3.6-1.4 6-4.5 6-7.9V5l-6-2.5Z",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.4",
      strokeLinejoin: "round"
    }
  ), /* @__PURE__ */ import_react.default.createElement(
    "path",
    {
      d: "M10 7v3.4M10 13h.01",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinecap: "round"
    }
  ));
}
function EyeIcon() {
  return /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react.default.createElement(
    "path",
    {
      d: "M1.8 10S4.9 4.8 10 4.8 18.2 10 18.2 10 15.1 15.2 10 15.2 1.8 10 1.8 10Z",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.4",
      strokeLinejoin: "round"
    }
  ), /* @__PURE__ */ import_react.default.createElement(
    "circle",
    {
      cx: "10",
      cy: "10",
      r: "2.4",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.4"
    }
  ));
}
function HandIcon() {
  return /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react.default.createElement(
    "g",
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.4",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    },
    /* @__PURE__ */ import_react.default.createElement("path", { d: "M7 9V4.7a1.2 1.2 0 0 1 2.4 0V9" }),
    /* @__PURE__ */ import_react.default.createElement("path", { d: "M9.4 8.6V3.8a1.2 1.2 0 0 1 2.4 0V9" }),
    /* @__PURE__ */ import_react.default.createElement("path", { d: "M11.8 9V5.6a1.2 1.2 0 0 1 2.4 0v6.1c0 2.6-1.9 4.6-4.5 4.6-2.4 0-3.6-1.1-4.6-2.8L3.6 11a1.2 1.2 0 0 1 2-1.3L7 11.3" })
  ));
}
function BrowserControlNotice({ copy, onAccept }) {
  const risks = [
    { Icon: ShieldIcon, text: copy.onboardingRiskInjection },
    { Icon: EyeIcon, text: copy.onboardingRiskPrivacy },
    { Icon: HandIcon, text: copy.onboardingRiskOversight }
  ];
  return /* @__PURE__ */ import_react.default.createElement("main", { className: "redrob-onboarding" }, /* @__PURE__ */ import_react.default.createElement(RedrobWordmark, { className: "redrob-onboarding-mark" }), /* @__PURE__ */ import_react.default.createElement("h1", { className: "redrob-onboarding-title" }, copy.onboardingTitle), /* @__PURE__ */ import_react.default.createElement("p", { className: "redrob-onboarding-body" }, copy.onboardingBody), /* @__PURE__ */ import_react.default.createElement("ul", { className: "redrob-onboarding-risks" }, risks.map(({ Icon, text }) => /* @__PURE__ */ import_react.default.createElement("li", { key: text }, /* @__PURE__ */ import_react.default.createElement("span", { "aria-hidden": "true", className: "redrob-onboarding-risk-icon" }, /* @__PURE__ */ import_react.default.createElement(Icon, null)), /* @__PURE__ */ import_react.default.createElement("span", null, text)))), /* @__PURE__ */ import_react.default.createElement(Button, { className: "redrob-onboarding-accept", onClick: onAccept }, copy.onboardingAccept));
}

// src/chat/onboarding-state.js
var STORAGE_KEY2 = "redrobBrowserControlAcknowledged";
function storageArea7() {
  return globalThis.chrome?.storage?.local;
}
async function hasAcknowledgedBrowserControl() {
  const area = storageArea7();
  if (!area) return true;
  try {
    const stored = await area.get(STORAGE_KEY2);
    return stored?.[STORAGE_KEY2] === true;
  } catch {
    return true;
  }
}
async function acknowledgeBrowserControl() {
  try {
    await storageArea7()?.set({ [STORAGE_KEY2]: true });
  } catch {
  }
}
function useBrowserControlConsent(React22) {
  const [acknowledged, setAcknowledged] = React22.useState(null);
  React22.useEffect(() => {
    let active = true;
    void hasAcknowledgedBrowserControl().then((value) => {
      if (active) setAcknowledged(value);
    });
    return () => {
      active = false;
    };
  }, []);
  const accept = React22.useCallback(async () => {
    setAcknowledged(true);
    await acknowledgeBrowserControl();
  }, []);
  return { acknowledged, accept };
}

// src/chat/tool-permission-state.js
var sessionApprovals = /* @__PURE__ */ new Set();
function resetToolApprovals() {
  sessionApprovals.clear();
}

// src/chat/session-policy.js
var SESSION_POLICIES = ["keep", "new"];
var DEFAULT_SESSION_POLICY = "keep";
var STORAGE_KEY3 = "redrobSessionPolicy";
async function readSessionPolicy(storage = chrome.storage?.local) {
  const stored = await storage?.get(STORAGE_KEY3);
  const value = stored?.[STORAGE_KEY3];
  return SESSION_POLICIES.includes(value) ? value : DEFAULT_SESSION_POLICY;
}
function shouldStartNewSession({
  policy,
  previousTabId,
  nextTabId,
  isSending
}) {
  if (policy !== "new") return false;
  if (isSending) return false;
  if (!Number.isInteger(nextTabId)) return false;
  return previousTabId !== nextTabId;
}

// src/chat/session-policy-install.js
function installSessionPolicy({
  tabs = chrome.tabs,
  isSending,
  startNewSession,
  initialTabId,
  readPolicy = readSessionPolicy
} = {}) {
  let currentTabId = initialTabId;
  const onActivated = async ({ tabId }) => {
    const policy = await readPolicy();
    const decision = shouldStartNewSession({
      policy,
      previousTabId: currentTabId,
      nextTabId: tabId,
      isSending: isSending()
    });
    currentTabId = tabId;
    if (decision) await startNewSession();
  };
  tabs?.onActivated?.addListener(onActivated);
  return () => tabs?.onActivated?.removeListener(onActivated);
}

// src/chat/tool-permission.jsx
var ARGUMENT_LABELS = {
  action: "Action",
  url: "URL",
  ref: "Element",
  value: "Value",
  text: "Text",
  query: "Search",
  coordinate: "At",
  width: "Width",
  height: "Height",
  filename: "File",
  tabIds: "Tabs"
};
function describeToolArguments(args) {
  return Object.entries(args ?? {}).filter(([, value]) => value !== void 0 && value !== null).slice(0, 6).map(([key, value]) => ({
    label: ARGUMENT_LABELS[key] ?? key,
    value: formatArgumentValue(value)
  }));
}
function formatArgumentValue(value) {
  if (Array.isArray(value)) {
    const parts = value.map(
      (item) => item && typeof item === "object" ? item.name ?? Object.keys(item).join("/") : String(item)
    );
    return truncate(parts.join(", "));
  }
  if (value && typeof value === "object") {
    return truncate(Object.keys(value).join(", "));
  }
  return truncate(String(value));
}
function truncate(text, limit = 120) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
function hostOf(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
function ToolPermissionPrompt({ copy }) {
  const { pendingToolApproval } = useRedrobChatStore(import_react.default);
  if (!pendingToolApproval) return null;
  const { toolName, args, origin } = pendingToolApproval;
  const decide = (allowed, scope) => {
    void pendingToolApproval.resolve(allowed, scope);
    redrobChatStore.getState().setPendingToolApproval(null);
  };
  return /* @__PURE__ */ import_react.default.createElement(
    ApprovalStep,
    {
      className: "redrob-permission-prompt",
      title: `${describeToolCall(toolName, args, copy)}${copy.allowActionSuffix}`,
      description: copy.allowActionBody(toolName),
      rejectLabel: copy.deny,
      approveLabel: copy.allowOnce,
      alwaysLabel: origin ? copy.allowSite(hostOf(origin)) : copy.alwaysAllow,
      onReject: () => decide(false),
      onApprove: () => decide(true, "once"),
      onAlways: () => decide(true, origin ? "always" : "session"),
      detail: (
        // Kept as a <dl>: these are name/value pairs, and that is the element for
        // them. The library has no key-value control, and a Table here would be a
        // grid for one column of facts.
        /* @__PURE__ */ import_react.default.createElement("dl", { className: "redrob-permission-args" }, describeToolArguments(args).map(({ label, value }) => /* @__PURE__ */ import_react.default.createElement("div", { key: label }, /* @__PURE__ */ import_react.default.createElement("dt", null, label), /* @__PURE__ */ import_react.default.createElement("dd", null, value))))
      )
    }
  );
}

// src/chat/render-gate.jsx
function ApiKeySetupShell({ ApiKeySetupScreen, apiKeySetupProps }) {
  const Screen = ApiKeySetupScreen;
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "flex flex-col h-screen bg-bg-100 items-center justify-center p-4" }, /* @__PURE__ */ import_react.default.createElement(Screen, { ...apiKeySetupProps }));
}
function SidepanelRenderGate({
  credentials,
  isMcpPermissionOnly = false,
  updateBlocked,
  hasBrowserControlPermission = true,
  secondaryTabBlocked,
  orgBlockedTabs,
  startupSelectionPending = false,
  LoadingScreen: LoadingScreen2,
  ApiKeySetupScreen,
  apiKeySetupProps,
  McpPermissionOnlyScreen,
  mcpPermissionOnlyProps,
  UpdateBlockedScreen,
  BrowserControlPermissionScreen,
  browserControlProps,
  SecondaryTabBlockedScreen,
  OrgBlockedTabsScreen,
  ChatShell: ChatShell2,
  chatShellProps
}) {
  if (isMcpPermissionOnly) {
    if (!McpPermissionOnlyScreen) return null;
    return /* @__PURE__ */ import_react.default.createElement(McpPermissionOnlyScreen, { ...mcpPermissionOnlyProps });
  }
  if (credentials.isLoading) {
    return /* @__PURE__ */ import_react.default.createElement(LoadingScreen2, null);
  }
  if (updateBlocked?.isBlocked) {
    if (!UpdateBlockedScreen) return null;
    return /* @__PURE__ */ import_react.default.createElement(
      UpdateBlockedScreen,
      {
        currentVersion: updateBlocked.currentVersion,
        minSupportedVersion: updateBlocked.minSupportedVersion || ""
      }
    );
  }
  if (credentials.needsApiKey) {
    return /* @__PURE__ */ import_react.default.createElement(
      ApiKeySetupShell,
      {
        ApiKeySetupScreen,
        apiKeySetupProps
      }
    );
  }
  if (!hasBrowserControlPermission) {
    if (!BrowserControlPermissionScreen) return null;
    return /* @__PURE__ */ import_react.default.createElement(BrowserControlPermissionScreen, { ...browserControlProps });
  }
  if (secondaryTabBlocked?.isBlocked) {
    if (!SecondaryTabBlockedScreen) return null;
    return /* @__PURE__ */ import_react.default.createElement(
      SecondaryTabBlockedScreen,
      {
        mainTabId: secondaryTabBlocked.mainTabId,
        onSwitchToMainTab: () => {
        }
      }
    );
  }
  if (orgBlockedTabs?.isBlocked) {
    if (!OrgBlockedTabsScreen) return null;
    return /* @__PURE__ */ import_react.default.createElement(OrgBlockedTabsScreen, { ...orgBlockedTabs.props });
  }
  if (startupSelectionPending) {
    return /* @__PURE__ */ import_react.default.createElement(LoadingScreen2, null);
  }
  return /* @__PURE__ */ import_react.default.createElement(ChatShell2, { ...chatShellProps });
}
function createSidepanelCredentialRenderModel(apiKeyState) {
  return {
    isLoading: apiKeyState.isLoading,
    needsApiKey: apiKeyState.needsApiKey,
    apiKey: apiKeyState.apiKey
  };
}

// src/chat/sidepanel-app.jsx
var apiKeyDependencies = {
  React: import_react.default,
  storageKeys: { REDROB_API_KEY: STORAGE_KEYS.apiKey },
  getLocalStorageItem: async (key, defaultValue) => {
    if (key === STORAGE_KEYS.apiKey) {
      const stored = await readStoredApiKey();
      return stored || defaultValue;
    }
    const result = await chrome.storage.local.get(key);
    return result[key] ?? defaultValue;
  }
};
function LoadingScreen() {
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "flex h-screen items-center justify-center bg-bg-100 text-text-200" }, "Loading Redrob…");
}
function ChatShell({
  apiKey,
  needsApiKey,
  copy,
  locale,
  onLocaleChange
}) {
  const { messages, isSending } = useRedrobChatStore(import_react.default);
  const startNewChat = async () => {
    stopChatMessage();
    resetToolApprovals();
    await clearConversation();
  };
  return /* @__PURE__ */ import_react.default.createElement("main", { className: "flex h-screen flex-col overflow-hidden bg-bg-100 text-text-100" }, /* @__PURE__ */ import_react.default.createElement(
    ChatHeader,
    {
      onNewChat: startNewChat,
      canStartNewChat: !isSending && messages.length > 0,
      copy,
      messages,
      onLocaleChange,
      locale
    }
  ), /* @__PURE__ */ import_react.default.createElement(
    MessageList,
    {
      copy,
      isSending: isSending || needsApiKey,
      onPick: (text) => sendChatMessage(apiKey, text)
    }
  ), /* @__PURE__ */ import_react.default.createElement(ToolPermissionPrompt, { copy }), needsApiKey ? /* @__PURE__ */ import_react.default.createElement(ApiKeyNotice, { copy }) : null, /* @__PURE__ */ import_react.default.createElement(
    Composer2,
    {
      onSend: (text) => sendChatMessage(apiKey, text),
      onStop: stopChatMessage,
      copy,
      disabled: needsApiKey
    }
  ));
}
function SidepanelApp() {
  const apiKeyState = useApiKeyState(apiKeyDependencies);
  const copy = useUiCopy(import_react.default);
  const [locale, setLocale] = (0, react_exports.useState)(copy.locale);
  import_react.default.useEffect(() => setLocale(copy.locale), [copy.locale]);
  const onLocaleChange = import_react.default.useCallback(async (next) => {
    setLocale(next);
    await chrome.storage.local.set({ preferred_locale: next });
  }, []);
  const consent = useBrowserControlConsent(import_react.default);
  import_react.default.useEffect(() => setAgentCopy(copy), [copy]);
  const ChatOrNotice = consent.acknowledged === false ? BrowserControlNotice : ChatShell;
  return /* @__PURE__ */ import_react.default.createElement(
    SidepanelRenderGate,
    {
      credentials: {
        ...createSidepanelCredentialRenderModel(apiKeyState),
        // Upstream put a wall in front of the panel until you were signed in.
        // We let people in and ask for the key in a strip above the composer,
        // so the interface can be read before a credential is demanded.
        needsApiKey: false
      },
      startupSelectionPending: consent.acknowledged === null,
      LoadingScreen,
      ApiKeySetupScreen: ApiKeyNotice,
      ChatShell: ChatOrNotice,
      apiKeySetupProps: { copy },
      chatShellProps: {
        apiKey: apiKeyState.apiKey,
        needsApiKey: apiKeyState.needsApiKey,
        copy,
        locale,
        onLocaleChange,
        onAccept: consent.accept
      }
    }
  );
}
function initializeSidepanelRuntime() {
  initializeSidepanelTabContext();
  installPanelMessageListener();
  restoreConversation();
  persistConversationOnChange();
  installAppearance();
  installSessionPolicy({
    isSending: () => redrobChatStore.getState().isSending,
    startNewSession: async () => {
      stopChatMessage();
      resetToolApprovals();
      await clearConversation();
    },
    initialTabId: Number.parseInt(
      new URLSearchParams(location.search).get("tabId") ?? "",
      10
    )
  });
}

export {
  react_exports,
  import_react,
  import_client,
  useUiCopy,
  installAppearance,
  useApiKeyState,
  apiKeyDependencies,
  ChatShell,
  SidepanelApp,
  initializeSidepanelRuntime
};
//# sourceMappingURL=chunk-XIAHWEUX.js.map
