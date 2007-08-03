/**
 * @fileoverview
 * Remote Client Implementation.
 * 
 * Requires: Core, Serial, WebCore, Application, Render.
 */

/**
 * Creates a new RemoteClient instance.
 * @class A client which provides a remote view of an Echo application being executed on the server.
 *        This client exchanges data with the remote server in the form of XML messages containing
 *        serialized components and events.
 * @constructor
 * @param serverUrl the URL of the server
 * @param domainElementId the id of the DOM element which this client should use as its
 *        root element (this element must define a horizontal and vertical space, e.g.,
 *        it must define an absolute area or percentage of the screen)
 * 
 */
EchoRemoteClient = function(serverUrl) {
    EchoClient.call(this);
    
    this._serverUrl = serverUrl;

    /**
     * MethodRef to _processComponentUpdate() method.
     */
    this._processComponentUpdateRef = new EchoCore.MethodRef(this, this._processComponentUpdate);

    /**
     * MethodRef to _processComponentEvent() method.
     */
    this._processComponentEventRef = new EchoCore.MethodRef(this, this._processComponentEvent);
    
    /**
     * Mapping between shorthand URL codes and replacement values.
     */
    this._urlMappings = new Object();
    this._urlMappings["I"] = this._serverUrl + "?sid=Echo.Image&iid=";
    
    EchoWebCore.init();
    
    this._clientMessage = new EchoRemoteClient.ClientMessage(this, true);

    this._asyncManager = new EchoRemoteClient.AsyncManager(this);
};

EchoRemoteClient.prototype = EchoCore.derive(EchoClient);

/**
 * Base URL from which libraries should be retrieved.
 * Libraries are loaded into global scope, and are thus not
 * bound to any particular client instance.
 * 
 * @type String
 */
EchoRemoteClient.libraryServerUrl = null;

/**
 * Global array containing 
 */
EchoRemoteClient._activeClients = new Array();

/**
 * Global listener to respond to resizing of browser window.
 * Invokes _windowResizeListener() on all active clients.
 * 
 * @param e the DOM resize event
 */
EchoRemoteClient._globalWindowResizeListener = function(e) {
    for (var i = 0; i < EchoRemoteClient._activeClients.length; ++i) {
        EchoRemoteClient._activeClients[i]._windowResizeListener(e);
    }
};

/**
 * Adds a listener for an arbitrary event type to a component.
 * This method is invoked by the Serial module when event tags are
 * processed during the deserialization of component synchronization
 * XML messages.
 * 
 * @param {EchoApp.Component} component the component on which the listener should be added
 * @param {String} eventType the type of event
 */
EchoRemoteClient.prototype.addComponentListener = function(component, eventType) {
    component.addListener(eventType, this._processComponentEventRef);
};

/**
 * Returns the URL of a library service based on the serviceId.
 * 
 * @param serviceId the serviceId
 * @return the full library URL
 * @type String
 * @private
 */
EchoRemoteClient.prototype._getLibraryServiceUrl = function(serviceId) {
    if (!EchoRemoteClient._libraryServerUrl) {
        EchoRemoteClient._libraryServerUrl = this._serverUrl;
    }
    return EchoRemoteClient._libraryServerUrl + "?sid=" + serviceId;
};

/**
 * Returns the URL of a service based on the serviceId.
 * 
 * @param serviceId the serviceId
 * @return the full URL
 * @type String
 * @private
 */
EchoRemoteClient.prototype.getServiceUrl = function(serviceId) {
    return this._serverUrl + "?sid=" + serviceId;
};

EchoRemoteClient.prototype.init = function(initialResponseDocument) {
    var domainElementId = initialResponseDocument.documentElement.getAttribute("root");
    var domainElement = document.getElementById(domainElementId);
    if (!domainElement) {
        throw new Error("Cannot find domain element: " + domainElementId);
    }
    
    var application = new EchoApp.Application();
    application.addComponentUpdateListener(this._processComponentUpdateRef);
    
    this.configure(application, domainElement);
    
    EchoRemoteClient._activeClients.push(this);

    this._storeUpdates = false;
    this._initialized = true;
};

/**
 * Processes an event from a component that requires immediate server interaction.
 * 
 * @param e the event to process
 */
EchoRemoteClient.prototype._processComponentEvent = function(e) {
    if (!this._clientMessage) {
        if (new Date().getTime() - this._syncInitTime > 2000) {
            //FIXME. Central error handling for these.
            alert("Waiting on server response.  Press the browser reload or refresh button if server fails to respond.");
        }
        return;
    }
    this._clientMessage.setEvent(e.source.renderId, e.type, e.data);
    this.sync();
};

/**
 * Processes an update to a component (storing the updated state in the outgoing
 * client message).
 * 
 * @param e the property update event from the component
 */
EchoRemoteClient.prototype._processComponentUpdate = function(e) {
    if (!this._clientMessage) {
        //FIXME. need to work on scenarios where clientmessage is null, for both this and events too.
        return;
    }
    this._clientMessage.storeProperty(e.parent.renderId, e.propertyName, e.newValue);
};

/**
 * Decompresses a shorthand URL into a valid full-length URL.
 * A shorthand URL is expressed as "!A!xxxx" where
 * "A" is a key whose value contains the first portion of the URL
 * and "xxxx" is the latter portion of the URL.  Such URLs are used
 * to reduce the amount of bandwidth used in transmitting large
 * numbers of the same URL from server-to-client.
 *
 * @param url the shorthand URL to process
 * @return the full-length valid URL
 * @type String
 */
EchoRemoteClient.prototype.decompressUrl = function(url) {
    var urlTokens = url.split("!");
    if (urlTokens[0]) {
        // urlTokens[0] is not empty: URL is not a shorthand URL.
        return url;
    } else {
        // urlTokens[0] = empty
        // urlTokens[1] = key
        // urlTokens[2] = baseUrl
        if (urlTokens.length != 3) {
            throw new IllegalArgumentException("Invalid encoded URL");
        }
        var replacementValue = this._urlMappings[urlTokens[1]]; 
        if (replacementValue == null) {
            throw new Error("Invalid URL shorthand key \"" + urlTokens[1] + "\".");
        }
        return replacementValue + urlTokens[2];
    }
};

/**
 * ServerMessage completion listener.
 * 
 * @param e the server message completion event
 */
EchoRemoteClient.prototype._processSyncComplete = function(e) {
    if (EchoCore.profilingTimer) {
        EchoCore.profilingTimer.mark("ser"); // Serialization
    }
    
    this._clientMessage = new EchoRemoteClient.ClientMessage(this, false);
    this.application.addComponentUpdateListener(this._processComponentUpdateRef);
	EchoRender.processUpdates(this.application.updateManager);
    
    if (EchoCore.profilingTimer) {
        EchoCore.Debug.consoleWrite(EchoCore.profilingTimer);
        EchoCore.profilingTimer = null;
    }
};

/**
 * Instance listener to respond to resizing of browser window.
 * 
 * @param e the DOM resize event
 */
EchoRemoteClient.prototype._windowResizeListener = function(e) {
    EchoRender.notifyResize(this.application.rootComponent);
};

/**
 * Process a response to a client-server synchronization.
 * 
 * @param e the HttpConnection response event
 */
EchoRemoteClient.prototype._processSyncResponse = function(e) {
    var responseDocument = e.source.getResponseXml();
    if (!e.valid || !responseDocument || !responseDocument.documentElement) {
        //FIXME. Central error handling for things like this.
        //FIXME. Shut down further client input with secondary "you're beating a dead horse" error message. 
        var msg = "An invalid response was received from the server";
        if (e.exception) {
        	msg += ": " + e.exception;
        } else if (e.source.getResponseText()) {
        	msg += ": \"" + e.source.getResponseText() + "\"";
        }
        msg += ". Press the browser reload or refresh button.";
        alert(msg);
        return;
    }
    
    if (!this._initialized) {
        this.init(responseDocument);
    }
    
    // Profiling Timer (Uncomment to enable).
    EchoCore.profilingTimer = new EchoCore.Debug.Timer();

    this.application.removeComponentUpdateListener(this._processComponentUpdateRef);
    
    var serverMessage = new EchoRemoteClient.ServerMessage(this, responseDocument);
    
    serverMessage.addCompletionListener(new EchoCore.MethodRef(this, this._processSyncComplete));
    
    serverMessage.process();
};

/**
 * Initiates a client-server synchronization.
 */
EchoRemoteClient.prototype.sync = function() {
    this._asyncManager._stop();    
    this._syncInitTime = new Date().getTime();
    var conn = new EchoWebCore.HttpConnection(this.getServiceUrl("Echo.Sync"), "POST", 
            this._clientMessage._renderXml(), "text/xml");
    this._clientMessage = null;
    conn.addResponseListener(new EchoCore.MethodRef(this, this._processSyncResponse));
    conn.connect();
};

EchoRemoteClient.AsyncManager = function(client) {
    this._client = client;
    this._interval = 1000;
    this._runnable = new EchoCore.Scheduler.Runnable(this._interval, false, 
            new EchoCore.MethodRef(this, this._pollServerForUpdates));
};

EchoRemoteClient.AsyncManager.prototype._processPollResponse = function(e) {
    var responseDocument = e.source.getResponseXml();
    if (!e.valid || !responseDocument || !responseDocument.documentElement) {
        //FIXME. Central error handling for things like this.
        //FIXME. Shut down further client input with secondary "you're beating a dead horse" error message. 
        var msg = "An invalid response was received from the server";
        if (e.exception) {
            msg += ": " + e.exception;
        } else if (e.source.getResponseText()) {
            msg += ": \"" + e.source.getResponseText() + "\"";
        }
        msg += ". Press the browser reload or refresh button.";
        alert(msg);
        return;
    }
    
    if (responseDocument.documentElement.getAttribute("request-sync") == "true") {
        this._client.sync();
    } else {
        EchoCore.Scheduler.add(this._runnable);
    }
};

EchoRemoteClient.AsyncManager.prototype._pollServerForUpdates = function() {
    var conn = new EchoWebCore.HttpConnection(this._client.getServiceUrl("Echo.AsyncMonitor"), "GET");
    conn.addResponseListener(new EchoCore.MethodRef(this, this._processPollResponse));
    conn.connect();
};

EchoRemoteClient.AsyncManager.prototype._start = function() {
    EchoCore.Scheduler.add(this._runnable);
};

EchoRemoteClient.AsyncManager.prototype._stop = function() {
    EchoCore.Scheduler.remove(this._runnable);
};

EchoRemoteClient.ClientMessage = function(client, initialize) {
    this._client = client;
    this._componentIdToPropertyMap = new EchoCore.Collections.Map();
    this._initialize = initialize;
};

EchoRemoteClient.ClientMessage.prototype.setEvent = function(componentId, eventType, eventData) {
    this._eventComponentId = componentId;
    this._eventType = eventType;
    this._eventData = eventData;
};

EchoRemoteClient.ClientMessage.prototype.storeProperty = function(componentId, propertyName, propertyValue) {
    var propertyMap = this._componentIdToPropertyMap.get(componentId);
    if (!propertyMap) {
        propertyMap = new EchoCore.Collections.Map();
        this._componentIdToPropertyMap.put(componentId, propertyMap);
    }
    propertyMap.put(propertyName, propertyValue);
};

EchoRemoteClient.ClientMessage.prototype._renderXml = function() {
    var cmsgDocument = EchoWebCore.DOM.createDocument(
            "http://www.nextapp.com/products/echo/svrmsg/clientmessage.3.0", "cmsg");
    var cmsgElement = cmsgDocument.documentElement;
    
    if (this._initialize) {
        cmsgElement.setAttribute("t", "init");
    }
    
    // Render event information.
    if (this._eventType) {
        var eElement = cmsgDocument.createElement("e");
        eElement.setAttribute("t", this._eventType);
        eElement.setAttribute("i", this._eventComponentId);
        if (this._eventData != null) {
            if (typeof (this._eventData) == "object") {
                if (this._eventData.className) {
                    EchoSerial.storeProperty(this._client, eElement, this._eventData);
                }
            } else {
                eElement.setAttribute("v", this._eventData);
            }
        }
        cmsgElement.appendChild(eElement);
    }
    
    // Render property information.
    for (var componentId in this._componentIdToPropertyMap.associations) {
        var propertyMap = this._componentIdToPropertyMap.associations[componentId];
        for (var propertyName in propertyMap.associations) {
            var propertyValue = propertyMap.associations[propertyName];
            var pElement = cmsgDocument.createElement("p");
            pElement.setAttribute("i", componentId);
            pElement.setAttribute("n", propertyName);
            if (typeof (propertyValue) == "object") {
                if (propertyValue.className) {
                    EchoSerial.storeProperty(this._client, pElement, propertyValue);
                }
            } else {
                pElement.setAttribute("v", propertyValue);
            }
            
            cmsgElement.appendChild(pElement);
        }
    }
    
    return cmsgDocument;
};

/**
 * Default constructor
 * 
 * @class Base class for command execution peers.
 */
EchoRemoteClient.CommandExec = function() {
};

/**
 * Executes a command
 */
EchoRemoteClient.CommandExec.execute = function(commandData) { };

/**
 * SerevrMessage directive processor for command executions.
 */
EchoRemoteClient.CommandExecProcessor = function(client) { 
    this._client = client;
};

/**
 * Directive processor process() implementation.
 */
EchoRemoteClient.CommandExecProcessor.prototype.process = function(dirElement) {
    var cmdElement = dirElement.firstChild;
    while (cmdElement) {
        var type = cmdElement.getAttribute("t");
        cmdElement = cmdElement.nextSibling;
    }
};

/**
 * ServerMessage directive processor for component synchronizations.
 */
EchoRemoteClient.ComponentSyncProcessor = function(client) { 
    this._client = client;
    this._referenceMap = new Object();
};

EchoRemoteClient.ComponentSyncProcessor._numericReverseSort = function(a, b) {
    return b - a;
};

/**
 * Directive processor process() implementation.
 */
EchoRemoteClient.ComponentSyncProcessor.prototype.process = function(dirElement) {
    var element = dirElement.firstChild;
    while (element) {
        if (element.nodeType == 1) {
            switch (element.nodeName) {
            case "fr": this._processFullRefresh(element); break;
            case "rm": this._processComponentRemove(element); break;
            case "up": this._processComponentUpdate(element); break;
            case "add": this._processComponentAdd(element); break;
            case "ss": this._processStyleSheet(element); break;
            case "sp": this._processStoreProperties(element); break;
            }
        }
        element = element.nextSibling;
    }
};

EchoRemoteClient.ComponentSyncProcessor.prototype._processComponentAdd = function(addElement) {
    var parentComponent;
    if (addElement.getAttribute("r") == "true") {
        parentComponent = this._client.application.rootComponent;
    } else {
        var parentId = addElement.getAttribute("i");
        parentComponent = this._client.application.getComponentByRenderId(parentId);
    }
    var element = addElement.firstChild;
    while (element) {
        if (element.nodeType == 1) {
            var component = EchoSerial.loadComponent(this._client, element, this._referenceMap);
            var index = element.getAttribute("x");
            if (index == null) {
                parentComponent.add(component);
            } else {
                parentComponent.add(component, parseInt(index));
            }
        }
        element = element.nextSibling;
    }
};

EchoRemoteClient.ComponentSyncProcessor.prototype._processComponentRemove = function(removeElement) {
    if (removeElement.childNodes.length > 5) {
        // Special case: many children being removed: create renderId -> index map and remove by index
        // in order to prevent Component.indexOf() of from being invoked n times.
        
        // Find parent component.
        var cElement = removeElement.firstChild;
        var parent;
        while (cElement) {
            var component = this._client.application.getComponentByRenderId(cElement.getAttribute("i"));
            if (component) {
                parent = component.parent;
                break;
            }
            cElement = cElement.nextSibling;
        }
        if (!parent) {
            return;
        }
        
        // Create map between ids and indices.
        var idToIndexMap = new Object();
        for (var i = 0; i < parent.children.length; ++i) {
            idToIndexMap[parent.children[i].renderId] = i;
        }
        
        // Create array of indices to remove.
        var indicesToRemove = new Array();
        cElement = removeElement.firstChild;
        while (cElement) {
            var index = idToIndexMap[cElement.getAttribute("i")];
            if (index != null) {
                indicesToRemove.push(parseInt(index));
            }
            cElement = cElement.nextSibling;
        }
        indicesToRemove.sort(EchoRemoteClient.ComponentSyncProcessor._numericReverseSort);

        // Remove components (last to first).
        for (var i = 0; i < indicesToRemove.length; ++i) {
            parent.remove(indicesToRemove[i]);
        }
    } else {
        var cElement = removeElement.firstChild;
        while (cElement) {
            var component = this._client.application.getComponentByRenderId(cElement.getAttribute("i"));
            if (component) {
                component.parent.remove(component);
            }
            cElement = cElement.nextSibling;
        }
    }
};

EchoRemoteClient.ComponentSyncProcessor.prototype._processComponentUpdate = function(updateElement) {
    var component;
    if (updateElement.getAttribute("r") == "true") {
        component = this._client.application.rootComponent;
    } else {
        var componentId = updateElement.getAttribute("i");
        component = this._client.application.getComponentByRenderId(componentId);
    }
    
    var styleName = updateElement.getAttribute("s");
    if (styleName != null) {
        component.setStyleName(styleName == "" ? null : styleName); //FIXME verify this works as desired for unsets.
        var styleType = updateElement.getAttribute("st");
        if (styleType) {
            component.setStyleType(styleType);
        } else {
            component.setStyleType(null);
        }
    }
    
    var enabledState = updateElement.getAttribute("en");
    if (enabledState) {
        component.setEnabled(enabledState == "true");
    }
    
    var element = updateElement.firstChild;
    while (element) {
        switch (element.nodeName) {
        case "p": // Property
            EchoSerial.loadProperty(this._client, element, component, null, this._referenceMap);
            break;
        }
        element = element.nextSibling;
    }
};

EchoRemoteClient.ComponentSyncProcessor.prototype._processFullRefresh = function(frElement) {
    this._client.application.rootComponent.removeAll();
};

EchoRemoteClient.ComponentSyncProcessor.prototype._processStoreProperties = function(spElement) {
    var propertyElement = spElement.firstChild;
    while (propertyElement) {
        switch (propertyElement.nodeName) {
        case "rp": // Referenced Property
            var propertyId = propertyElement.getAttribute("i");
            var propertyType = propertyElement.getAttribute("t");
            var translator = EchoSerial.getPropertyTranslator(propertyType);
            if (!translator) {
                throw new Error("Translator not available for property type: " + propertyType);
            }
            propertyValue = translator.toProperty(this._client, propertyElement);
            this._referenceMap[propertyId] = propertyValue;
            break;
        }
        propertyElement = propertyElement.nextSibling;
    }
};

EchoRemoteClient.ComponentSyncProcessor.prototype._processStyleSheet = function(ssElement) {
    var styleSheet = EchoSerial.loadStyleSheet(this._client, ssElement);
    this._client.application.setStyleSheet(styleSheet);
};

EchoRemoteClient.ServerMessage = function(client, xmlDocument) { 
    this.client = client;
    this.document = xmlDocument;
    this._listenerList = new EchoCore.ListenerList();
    this._processorInstances = new Object();
};

EchoRemoteClient.ServerMessage._processorClasses = new Object();

EchoRemoteClient.ServerMessage.prototype.addCompletionListener = function(l) {
    this._listenerList.addListener("completion", l);
};

EchoRemoteClient.ServerMessage.addProcessor = function(name, processor) {
    EchoRemoteClient.ServerMessage._processorClasses[name] = processor;
};

EchoRemoteClient.ServerMessage.prototype.process = function() {
    // Processing phase 1: load libraries.
    var libsElement = EchoWebCore.DOM.getChildElementByTagName(this.document.documentElement, "libs");
    if (libsElement) {
        var libraryGroup = new EchoWebCore.Library.Group();
        var element = libsElement.firstChild;
        while (element) {
            if (element.nodeType == 1) {
                if (element.nodeName == "lib") {
                    var url = this.client._getLibraryServiceUrl(element.getAttribute("i"));
                    libraryGroup.add(url);
                }
            }
            element = element.nextSibling;
        }
        if (libraryGroup.hasNewLibraries()) {
            libraryGroup.addLoadListener(new EchoCore.MethodRef(this, this._processPostLibraryLoad));
            libraryGroup.load();
        } else {
            this._processPostLibraryLoad();
        }
    } else {
        this._processPostLibraryLoad();
    }
};

EchoRemoteClient.ServerMessage.prototype._processPostLibraryLoad = function() {
    EchoCore.profilingTimer.mark("lib"); // Library Loading
    // Processing phase 2: invoke directives.
    var groupElements = EchoWebCore.DOM.getChildElementsByTagName(this.document.documentElement, "group");
    for (var i = 0; i < groupElements.length; ++i) {
        var dirElements = EchoWebCore.DOM.getChildElementsByTagName(groupElements[i], "dir");
        for (var j = 0; j < dirElements.length; ++j) {
            var procName = dirElements[j].getAttribute("proc");
            var processor = this._processorInstances[procName];
            if (!processor) {
                // Create new processor instance.
                if (!EchoRemoteClient.ServerMessage._processorClasses[procName]) {
                    throw new Error("Invalid processor specified in ServerMessage: " + procName);
                }
                processor = new EchoRemoteClient.ServerMessage._processorClasses[procName](this.client);
                this._processorInstances[procName] = processor;
            }
            processor.process(dirElements[j]);
        }
    }

    // Complete: notify listeners of completion.
    this._listenerList.fireEvent(new EchoCore.Event(this, "completion"));
    
    // Start server push listener if required.
    if (this.document.documentElement.getAttribute("async-interval")) {
        this.client._asyncManager._start();
    }
};

EchoRemoteClient.ServerMessage.prototype.removeCompletionListener = function(l) {
    this._listenerList.removeListener("completion", l);
};

EchoRemoteClient.ServerMessage.addProcessor("CSync", EchoRemoteClient.ComponentSyncProcessor);
EchoRemoteClient.ServerMessage.addProcessor("CmdExec", EchoRemoteClient.CommandExecProcessor);

EchoWebCore.DOM.addEventListener(window, "resize", EchoRemoteClient._globalWindowResizeListener, false);
