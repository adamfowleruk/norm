var basic = null, digest = null, thru = null, noop = null, winston = null, jsdom = null;
var logger = null;
if (typeof(window) === 'undefined') {
  basic = require("./lib/basic-wrapper");
  digest = require("./lib/digest-wrapper");
  thru = require("./lib/passthrough-wrapper");
  noop = require("./lib/noop");
  winston = require('winston');
  jsdom = require('jsdom');

  logger = new (winston.Logger)({
    transports: [
      new winston.transports.Console()
    ],
    exceptionHandlers: [
      new winston.transports.Console()
    ]
  });
} else {
  noop = function() {
    // do nothing
  };
  var cl = function() {
    // do nothing
    this.loglevels = ["debug", "info", "warn", "error"];
    this.loglevel = 0;
  };
  cl.prototype.setLogLevel = function(levelstring) {
    var l = 0;
    for (;l < this.loglevels.length;l++) {
      if (this.loglevels[l] == levelstring) {
        this.loglevel = l;
        l = this.loglevels.length;
      }
    }
  };
  cl.prototype.debug = function(msg) {
    if (this.loglevel == 0) {
      console.log("DEBUG: " + msg);
    }
  };
  cl.prototype.info = function(msg) {
    if (this.loglevel <= 1) {
      console.log("INFO:  " + msg);
    }
  };
  cl.prototype.warn = function(msg) {
    if (this.loglevel <= 2) {
      console.log("WARN:  " + msg);
    }
  };
  cl.prototype.error = function(msg) {
    if (this.loglevel <= 3) {
      console.log("ERROR: " + msg);
    }
  };
  logger = new cl();
}

// DEFAULTS

var defaultdboptions = {
  host: "localhost", port: 9090, adminport: 8002, ssl: false, auth: "digest", username: "admin",password: "admin", database: "mldbtest", searchoptions: {}, fastthreads: 10, fastparts: 100
}; // TODO make Documents the default db, automatically figure out port when creating new rest server

/**
 * Converts the specified text to XML using the Browser's built in XML support
 * @param {string} text - The textual representation of the XML
 */
function textToXML(text){
  var doc = null;
  if (typeof window === "undefined") {
    // return plain text in nodejs
    doc = jsdom.jsdom(text, null, { FetchExternalResources: false, ProcessExternalResources: false });
  } else {
	  if (window.ActiveXObject){
      doc=new ActiveXObject('Microsoft.XMLDOM');
      doc.async='false';
      doc.loadXML(text);
    } else {
      var parser=new DOMParser();
      doc=parser.parseFromString(text,'text/xml');
	  }
  }
	return doc;
};

/**
 * This returns a simplified JSON structure, equivalent to merging text nodes
 * removing whitespace and merging elements with attributes. Namespaces are also removed.
 * Use xmlToJsonStrict instead if you want an exact JSON representation of an XML document.
 *
 * @param {string} xml - The XML Document object to conver to JSON
 */
function xmlToJson(xml) {
  if (null == xml || undefined == xml) {
    return {};
  }
  var obj = {};
  if (xml.nodeType == 1) {                
    if (xml.attributes.length > 0) {
      //obj["@attributes"] = {};
      for (var j = 0; j < xml.attributes.length; j++) {
        var attribute = xml.attributes.item(j);
        var nodeName = attribute.nodeName;
        var pos = nodeName.indexOf(":");
        if (-1 != pos) {
          nodeName = nodeName.substring(pos + 1);
        }
        obj[nodeName] = attribute.value;
      }
    }
  } else if (xml.nodeType == 3) { 
    obj = xml.nodeValue;
  }            
  if (undefined != xml.childNodes) {
    var justText = true;
    for (var i = 0; i < xml.childNodes.length; i++) {
      var item = xml.childNodes.item(i);
      var nodeName = item.nodeName;
      var pos = nodeName.indexOf(":");
      if (-1 != pos) {
        nodeName = nodeName.substring(pos + 1);
      }
      if (typeof (obj[nodeName]) == "undefined") {
        obj[nodeName] = xmlToJson(item);
      } else {
        if (typeof (obj[nodeName].push) == "undefined") {
          var old = obj[nodeName];
          obj[nodeName] = [];
          obj[nodeName].push(old);
        }
        obj[nodeName].push(xmlToJson(item));
        // do text merge here
      }
      if (("#text" == nodeName)) {
        if (Array.isArray(obj[nodeName])) {
          var text = "";
          for (var a = 0;a < obj[nodeName].length;a++) {
            text += obj[nodeName][a];
          }
          text = text.replace("\n","").replace("\t","").replace("\r","").trim();
          if (0 != text.length) {
            obj[nodeName] = text;
          } else {
            obj[nodeName] = undefined;
          }
        } else if ("string" == typeof obj[nodeName]){
          var text = obj[nodeName];
          text = text.replace("\n","").replace("\t","").replace("\r","").trim();
          if (0 != text.length) {
            // check for a value of "\"\"", which MUST still be included in response (its a blank value, not XML whitespace)
            obj[nodeName] = text.replace("\"","").replace("\"","");
          } else {
            obj[nodeName] = undefined;
          }
        }
      }
      if (undefined != obj[nodeName]) {
        justText = justText && ("#text" == nodeName);
      }
    }
    // check all children to see if they are only text items
    // if so, merge text items
    // now replace #text child with just the merged text value
    if (justText && undefined != obj[nodeName]) {
      var text = "";
      for (var i = 0; i < obj[nodeName].length; i++) {
        if ("string" == typeof obj[nodeName][i]) {
          text += obj[nodeName][i];
        } else if (Array.isArray(obj[nodeName][i])) {
          // merge array then add to text
          // No need, done elsewhere above
          mldb.defaultconnection.logger.warn("WARNING: #text is still an array. Should not happen.")
        }
      }
      obj = text; // removes whitespace as unimportant // TODO replace with check for all string is whitespace first
    }
  }
  return obj;
};


/**
 * This returns a simplified JSON structure, equivalent to merging text nodes
 * removing whitespace and merging elements with attributes. Namespaces are also removed.
 * Use xmlToJsonStrict instead if you want an exact JSON representation of an XML document.
 *
 * THIS ONE IS FOR XML RESULTS TO JSON RESULTS
 *
 * @param {string} xml - The XML Document to transform to JSON
 */
function xmlToJsonSearchResults(xml) {
  if (null == xml || xml == undefined) {
    return {};
  }
  
  var obj = {};
  if (xml.nodeType == 1) {                
    if (xml.attributes.length > 0) {
      //obj["@attributes"] = {};
      for (var j = 0; j < xml.attributes.length; j++) {
        var attribute = xml.attributes.item(j);
        var nodeName = attribute.nodeName;
        var pos = nodeName.indexOf(":");
        if (-1 != pos) {
          nodeName = nodeName.substring(pos + 1);
        }
        obj[nodeName] = attribute.value;
      }
    }
  } else if (xml.nodeType == 3) { 
    obj = xml.nodeValue;
  }            
  if (undefined != xml.childNodes) {
    
    var justText = true;
    // check if parent name is 'result'. If so, return content json object with encoded string of all child nodes
    var isResultContent = false;
    if (null != xml.parentNode) {
      console.log("parentNode is not null");
      var ourName = xml.parentNode.nodeName;
      var pos = ourName.indexOf(":");
      if (-1 != pos) {
        ourName = ourName.substring(pos + 1);
      }
      console.log("ourName: " + ourName);
      if ("result"==ourName) {
        isResultContent = true;
      }
    }
      
    if (isResultContent) {
        console.log("GOT RESULT");
        /*
        var s = "";
        for (var i = 0; i < xml.childNodes.length; i++) {
          s += (new XMLSerializer()).serializeToString(xml.childNodes.item(i));
        }
        obj.content = s;
        */
        obj.content = (new XMLSerializer()).serializeToString(xml);
    } else {
  
    for (var i = 0; i < xml.childNodes.length; i++) {
      var item = xml.childNodes.item(i);
      var nodeName = item.nodeName;
      if (typeof (obj[nodeName]) == "undefined") {
        obj[nodeName] = xmlToJson(item);
      } else {
        if (typeof (obj[nodeName].push) == "undefined") {
          var old = obj[nodeName];
          obj[nodeName] = [];
          obj[nodeName].push(old);
        }
        obj[nodeName].push(xmlToJson(item));
        // do text merge here
      }
      if (("#text" == nodeName)) {
        if (Array.isArray(obj[nodeName])) {
          var text = "";
          for (var a = 0;a < obj[nodeName].length;a++) {
            text += obj[nodeName][a];
          }
          text = text.replace("\n","").replace("\t","").replace("\r","").trim();
          if (0 != text.length) {
            obj[nodeName] = text;
          } else {
            obj[nodeName] = undefined;
          }
        } else if ("string" == typeof obj[nodeName]){
          var text = obj[nodeName];
          text = text.replace("\n","").replace("\t","").replace("\r","").trim();
          if (0 != text.length) {
            // check for a value of "\"\"", which MUST still be included in response (its a blank value, not XML whitespace)
            obj[nodeName] = text.replace("\"","").replace("\"","");
          } else {
            obj[nodeName] = undefined;
          }
        }
      }
      if (undefined != obj[nodeName]) {
        justText = justText && ("#text" == nodeName);
      }
    }
  
    // check all children to see if they are only text items
    // if so, merge text items
    // now replace #text child with just the merged text value
    if (justText && undefined != obj[nodeName]) {
      var text = "";
      for (var i = 0; i < obj[nodeName].length; i++) {
        if ("string" == typeof obj[nodeName][i]) {
          text += obj[nodeName][i];
        } else if (Array.isArray(obj[nodeName][i])) {
          // merge array then add to text
          // No need, done elsewhere above
          mldb.defaultconnection.logger.warn("WARNING: #text is still an array. Should not happen.")
        }
      }
      obj = text; // removes whitespace as unimportant // TODO replace with check for all string is whitespace first
    }
    
  }
    
  }
  return obj;
 
};

/**
 * Strictly converts the supplied XML document to a JSON representation
 * from http://stackoverflow.com/questions/7769829/tool-javascript-to-convert-a-xml-string-to-json
 *
 * @param {string} xml - The XML Document to convert to JSON
 */
function xmlToJsonStrict(xml) {
  if (null == xml || undefined == typeof xml) {
    return {};
  }
  var obj = {};
  if (xml.nodeType == 1) {                
    if (xml.attributes.length > 0) {
      obj["@attributes"] = {};
      for (var j = 0; j < xml.attributes.length; j++) {
        var attribute = xml.attributes.item(j);
        obj["@attributes"][attribute.nodeName] = attribute.value;
      }
    }
  } else if (xml.nodeType == 3) { 
    obj = xml.nodeValue;
  }            
  if (xml.hasChildNodes()) {
    for (var i = 0; i < xml.childNodes.length; i++) {
      var item = xml.childNodes.item(i);
      var nodeName = item.nodeName;
      if (typeof (obj[nodeName]) == "undefined") {
        obj[nodeName] = xmlToJsonStrict(item);
      } else {
        if (typeof (obj[nodeName].push) == "undefined") {
          var old = obj[nodeName];
          obj[nodeName] = [];
          obj[nodeName].push(old);
        }
        obj[nodeName].push(xmlToJsonStrict(item));
      }
    }
  }
  return obj;
};



// INSTANCE CODE






// MLDB DATABASE OBJECT

var self;
/**
 * Creates an MLDB instance. Aliased to new mldb().
 * @constructor
 *
 * @tutorial browser-create-app
 * @tutorial samples
 */
var mldb = function() {
  this.configure();
};
var m = mldb;

// CONFIG METHODS

/**
 * Provide configuration information to this database. This is merged with the defaults.
 *
 * @param {JSON} dboptions - The DB Options to merge with the default options for this connection.
 */
mldb.prototype.configure = function(dboptions) {
  self = this;
  if (undefined == this.logger) {
    this.logger = logger;
  }
  
  // TODO abandon transaction if one exists
  // TODO kill in process http requests
  
  this.dboptions = defaultdboptions;
  if (undefined != dboptions) {
    this.dboptions = this.__merge(defaultdboptions,dboptions);
    this.logger.debug("MERGED: " + JSON.stringify(this.dboptions)); // TODO TEST
  }
  
  
  
  this.dboptions.wrappers = new Array();
  
  
  // determine which context we're running in
  if (!(typeof window ==="undefined")) {
    // in a browser
    
    if (!(typeof jQuery == 'undefined') && (!(undefined == mldb.bindings || undefined == mldb.bindings.jquery))) {
      // is jquery defined?
      logger.debug("Wrapper: jQuery, Version: " + jQuery.fn.jquery);
      if (undefined == mldb.bindings || undefined == mldb.bindings.jquery) {
        logger.debug("ERROR SEVERE: mldb.bindings.jquery is not defined. Included mldb-jquery.js ?");
      } else {
        this.dboptions.wrapper = new mldb.bindings.jquery();
      }
    } else if (!(typeof Prototype == 'undefined') && !(undefined == mldb.bindings || undefined == mldb.bindings.prototypejs)) {
      // is prototypejs defined?
      logger.debug("Wrapper: Prototype, Version: " + Prototype.Version);
      if (undefined == mldb.bindings || undefined == mldb.bindings.prototypejs) {
        logger.debug("ERROR SEVERE: mldb.bindings.prototypejs is not defined. Included mldb-prototype.js ?");
      } else {
        this.dboptions.wrapper = new mldb.bindings.prototypejs();
      }
    } else {
      // fallback to XMLHttpRequest
      logger.debug("Wrapper: Falling back to XMLHttpRequest");
      if (undefined == mldb.bindings) {
        logger.debug("ERROR SEVERE: mldb.bindings.xhr or xhr2 is not defined. Included mldb-xhr(2).js ?");
      } else {
        if (undefined == mldb.bindings.xhr) {
          logger.debug("Wrapper: Using XmlHttpRequest 2");
          this.dboptions.wrapper = new mldb.bindings.xhr2();
        } else {
          logger.debug("Wrapper: Using XmlHttpRequest");
          this.dboptions.wrapper = new mldb.bindings.xhr();
        }
      }
    }
    
    // set up default connection (most browser apps will have 1 connection only)
    if (undefined == m.defaultconnection) {
      m.defaultconnection = this;
    }
    
    // configure appropriate browser wrapper
    this.__doreq_impl = this.__doreq_wrap;
  } else {
    // in NodeJS
  
    // TODO support curl like 'anyauth' option to determine auth mechanism automatically (via HTTP 401 Authenticate)
    if (this.dboptions.auth == "basic") {
      this.dboptions.wrapper = new basic(); 
    } else if (this.dboptions.auth == "digest") {
     this.dboptions.wrapper = new digest();
    } else if (this.dboptions.auth == "none"){
      // no auth - default user
      this.dboptions.wrapper = new thru();
    } else if (this.dboptions.auth == "basicdigest" || this.dboptions.auth == "basic+digest") {
      // TODO basic+digest authentication
    }  
    
    this.__doreq_impl = this.__doreq_node;
  }
  this.dboptions.wrapper.configure(this.dboptions.username,this.dboptions.password,this.logger);
};

/**
 * Set the logging object to be used by this class and all wrappers. Must provide as a minimum a debug and info method that takes a single string.
 *
 * @param {object} newlogger - The logger object to use. Must support debug, log and info methods taking single string parameters.
 */
mldb.prototype.setLogger = function(newlogger) {
  //logger = newlogger;
  this.logger = newlogger;
  if (this.dboptions.wrapper != undefined) {
    this.dboptions.wrapper.logger = newlogger;
  }
};


if (typeof window === 'undefined') {
  // NodeJS exports
  module.exports = function() {return new mldb()};
} else {
  //mldb = m;
}




// PRIVATE METHODS

mldb.prototype.__genid = function() {
  return m.__dogenid();
};

m.__dogenid = function() {
  return "" + ((new Date()).getTime()) + "-" + Math.ceil(Math.random()*100000000);
}

/**
 * Invokes the appropriate Browser AJAX connection wrapper. Not to be called directly.
 * @private
 */
mldb.prototype.__doreq_wrap = function(reqname,options,content,callback_opt) {
  this.dboptions.wrapper.request(reqname,options,content,function(result) {
    (callback_opt || noop)(result);
  });
};

/**
 * Invokes the appropriate Node.js connection wrapper (see DigestWrapper and BasicWrapper for more information). Not to be called directly.
 * @private
 */
mldb.prototype.__doreq_node = function(reqname,options,content,callback_opt) {
  var self = this;
  
  var wrapper = this.dboptions.wrapper;
  
  // if hostname and port are not this db (ie if admin port), then use new wrapper object (or one previously saved)
  if (options.host != this.dboptions.host || options.port != this.dboptions.port) {
    var name = options.host + ":" + options.port;
    this.logger.debug("WARNING: Not accessing same host as REST API. Accessing: " + name);
    if (undefined == this.dboptions.wrappers[name]) {
      this.logger.debug("Creating new wrapper");
      var nw = new digest();
      nw.configure(this.dboptions.username,this.dboptions.password,this.logger);
      this.dboptions.wrappers[name] = nw;
      wrapper = nw;
    } else {
      this.logger.debug("Reusing saved wrapper");
      wrapper = this.dboptions.wrappers[name];
    }
  }
  
  var completeRan = false; // declared here incase of request error
  
  // add Connection: keep-alive
  options.headers["Connection"] = "keep-alive";
  
  var httpreq = wrapper.request(options, function(res) {
    var body = "";
    //self.logger.debug("---- START " + reqname);
    //self.logger.debug(reqname + " In Response");
    //self.logger.debug(reqname + " Got response: " + res.statusCode);
    //self.logger.debug("Method: " + options.method);
    
    
    res.on('data', function(data) {
      body += data;
      //self.logger.debug(reqname + " Data: " + data);
    });
    var complete =  function() { 
      if (!completeRan) {
        completeRan = true; // idiot check - complete can be called from many places and events
        self.logger.debug(reqname + " complete()");
        if (res.statusCode.toString().substring(0,1) == ("4")) {
          self.logger.debug(reqname + " error: " + body);
          var details = body;
          if ("string" == typeof body) {
            details = textToXML(body);
          }
          if (undefined != details.nodeType) {
            details = xmlToJson(details);
          }
          (callback_opt || noop)({statusCode: res.statusCode,error: body,inError: true, details: details});
        } else {
          // 2xx or 3xx response (200=OK, 303=Other(content created) )
          var jsonResult = {body: body, statusCode: res.statusCode,inError: false};
          if (options.method == "GET" && undefined != body && ""!=body) {
            self.logger.debug("Response (Should be JSON): '" + body + "'");
            jsonResult.doc = JSON.parse(body);
          }
          if (res.statusCode == 303) {
            self.logger.debug("303 result headers: " + JSON.stringify(res.headers));
            var loc = res.headers["location"]; // NB all headers are lower case in the request library
            if ((options.method == "PUT" || options.method == "POST") && loc != undefined) {
              // check for Location header - used a fair bit to indicate location of created resource
              jsonResult.location = loc;
            }
          }
          (callback_opt || noop)(jsonResult); // TODO probably pass res straight through, appending body data
        }
      }
    };
    res.on('end', function() {
      self.logger.debug(reqname + " End. Body: " + body);
      complete();
    });
    res.on('close',function() {
      self.logger.debug(reqname + " Close");
      complete();
    });
    res.on("error", function() {
      self.logger.debug(reqname + " ERROR: " + res.statusCode);
      completeRan = true;
      (callback_opt || noop)({statusCode: res.statusCode,error: body,inError: true});
    });
    
    self.logger.debug("Method: " + options.method);
    if (options.method == "PUT" || options.method == "DELETE") {
      complete();
    }
    self.logger.debug(reqname + " End Response (sync)");
    self.logger.debug("---- END " + reqname);
    
  });
  httpreq.on("error",function(e) {
    completeRan = true;
    self.logger.debug("__doreq: REQUEST ERROR: " + e);
    (callback_opt || noop)({inError: true,error: e}); 
  });
  if (undefined != content && null != content) {
    httpreq.write(JSON.stringify(content));
  }
  httpreq.end();
};

/**
 * Handles management of all HTTP requests passed to the wrappers. Should never be invoked directly.
 * @private
 */
mldb.prototype.__doreq = function(reqname,options,content,callback_opt) {
  this.logger.debug("__doreq: reqname: " + reqname + ", method: " + options.method + ", uri: " + options.path);
  if (undefined == options.host) {
    options.host = this.dboptions.host;
  }
  if (undefined == options.port) {
    options.port = this.dboptions.port;
  }
  if (undefined == options.headers) {
    options.headers = {};
  } else {
    this.logger.debug(reqname + " headers: " + JSON.stringify(options.headers))
  }
  // Convert format=json in to a content type header (increases performance for some reason)
  var pos = options.path.indexOf("format=json");
  if (-1 != pos) {
    //options.path = options.path.substring(0,pos - 1) + options.path.substring(pos+11);
    if (options.method !== "GET") {
      if (undefined !== typeof options.headers["Content-type"]) {
        options.headers["Content-type"] = "application/json";
      }
    }
    if (undefined !== typeof options.headers["Accept"]) {
      options.headers["Accept"] = "application/json"; // NB check this is not explicitly defined by calling method first
    }
    this.logger.debug("Converted format=json to Content-Type header. Path now: " + options.path + " , headers now: " + JSON.stringify(options.headers));
  }
  
  this.__doreq_impl(reqname,options,content,callback_opt);
};





// PASS THROUGH




/**
 * <p>Function allowing MLDB's underlying REST invocation mechanism to be used for an arbitrary request. </p><p>
 * Useful for future proofing should some new functionality come out, or bug discovered that prevents
 * your use of a JavaScript Driver API call.
 * </p>
 * @param {object} options_opt - {method: "GET|POST|PUT|DELETE", path: "/v1/somepath?key=value&format=json"}
 * @param {object} content_opt - undefined for GET, DELETE, json for PUT, whatever as required for POST
 * @param {object} callback_opt - the optional callback to invoke after the method has completed
 */
mldb.prototype.do = function(options_opt,content_opt,callback_opt) {
  if ((callback_opt == undefined) && (typeof(content_opt) === 'function')) {
    callback_opt = content_opt;
    content_opt = undefined;
  }
  this.__doreq("DO",options_opt,content_opt,callback_opt);
};






// DATABASE ADMINISTRATION FUNCTIONS




/**
 * Does this database exist? Returns an object, not boolean, to the callback
 *
 * @param {function} callback - The callback function to invoke
 */
mldb.prototype.exists = function(callback) {
  var options = {
    host: this.dboptions.host,
    port: this.dboptions.adminport,
    path: "/v1/rest-apis?database=" + encodeURI(this.dboptions.database) + "&format=json",
    method: "GET"
  };
  var self = this;
  this.__doreq("EXISTS",options,null,function(result) {
    self.logger.debug("EXISTS callback called... " + JSON.stringify(result));
    if (result.inError) {
      // if 404 then it's not technically in error
      self.logger.debug("exists: inError: " + JSON.stringify(result));
      result.exists = false; // assume 404 not found or connect exception
      result.inError = false;
      callback(result);
    } else {
      self.logger.debug("Returned rest api info: " + JSON.stringify(result.doc));
      //var ex = !(undefined == result.doc["rest-apis"] || (result.doc["rest-apis"].length == 0) ||undefined == result.doc["rest-apis"][0] || (undefined != result.doc["rest-apis"][0] && self.dboptions.database != result.doc["rest-apis"][0].database));
      var ex = false;
      if (undefined != result.doc["rest-apis"] && result.doc["rest-apis"].length > 0 && result.doc["rest-apis"][0].database == self.dboptions.database) {
        ex = true;
      }
      // NB can return http 200 with no data to mean that DB does not exist
      self.logger.debug("exists:? " + ex);
      callback({inError:false,exists:ex});
    }
  });
};
mldb.prototype.test = mldb.prototype.exists;


/**
 * Creates the database and rest server if it does not already exist
 *
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.create = function(callback_opt) {
  /*
  curl -v --anyauth --user admin:admin -X POST \
      -d'{"rest-api":{"name":"mldbtest-rest-9090","database": "mldbtest","modules-database": "mldbtest-modules","port": "9090"}}' \
      -H "Content-type: application/json" \
      http://localhost:8002/v1/rest-apis
  */
  
  var json = {"rest-api": {"name": this.dboptions.database, "database": this.dboptions.database, "modules-database":this.dboptions.database + "-modules", port: this.dboptions.port}};
  var options = {
    host: this.dboptions.host,
    port: this.dboptions.adminport,
    path: '/v1/rest-apis',
    method: 'POST',
    headers: {"Content-Type": "application/json", "Content-Length": JSON.stringify(json).length} // TODO refactor this in to __doreq
  };
  
  this.__doreq("CREATE",options,json,callback_opt);
};

/**
 * Destroys the database and rest api instance
 *
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.destroy = function(callback_opt) {
  var self = this;
  var dodestroy = function() {
    // don't assume the dbname is the same as the rest api name - look it up
  
    var getoptions = {
      host: self.dboptions.host,
      port: self.dboptions.adminport,
      path: "/v1/rest-apis?database=" + encodeURI(self.dboptions.database) + "&format=json",
      method: "GET"
    };
    self.__doreq("DESTROY-EXISTS",getoptions,null,function(result) {
      self.logger.debug("Returned rest api info: " + JSON.stringify(result.doc));
    
      var ex = !(undefined == result.doc["rest-apis"] || undefined == result.doc["rest-apis"][0] || self.dboptions.database != result.doc["rest-apis"][0].database);
    
      if (!ex) {
        // doesn't exist already, so return success
        self.logger.debug("Rest server for database " + this.dboptions.database + " does not exist already. Returning success.");
        (callback_opt || noop)({inError: false, statusCode: 200});
      } else {
        var restapi = result.doc["rest-apis"][0].name;
      
        var options = {
          host: self.dboptions.host,
          port: self.dboptions.adminport,
          path: '/v1/rest-apis/' + encodeURI(restapi) + "?include=" + encodeURI("content"), // TODO figure out how to include ,modules too, and why error is never caught or thrown
          method: 'DELETE'
        };
        self.__doreq("DESTROY",options,null,callback_opt);
      }
    
    });
  }
  
  // abandon any transaction if it exists
  if (undefined != this.__transaction_id) {
    this.rollbackTransaction(function(result) {
      // no matter what the result, destroy the db
      dodestroy();
    });
  } else {
    dodestroy();
  }
  
  
};





// DOCUMENT AND SEARCH FUNCTIONS





/**
 * <p>
 * Fetches a document with the given URI.
 * </p><p>
 * https://docs.marklogic.com/REST/GET/v1/documents
 * </p><p>
 * options_opt currently supports these options:-</p>
 * <ul>
 *  <li>transform - the name of the installed transform to use when fetching the document</li>
 * </ul>
 * 
 * @param {string} docuri - The URI of the document to retrieve
 * @param {JSON} options_opt - Additional optional options to use
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.get = function(docuri,options_opt,callback_opt) {
  if (undefined == callback_opt && typeof(options_opt)==='function') {
    callback_opt = options_opt;
    options_opt = undefined;
  }
  var options = {
    path: '/v1/documents?uri=' + encodeURI(docuri) + "&format=json",
    method: 'GET'
  };
  if (undefined != options_opt) {
    if (undefined != options_opt.transform) {
      options.path += "&transform=" + encodeURI(options_opt.transform)
    }
  }
  
  this.__doreq("GET",options,null,function (result) {
    result.docuri = docuri;
    (callback_opt||noop)(result);
  });
};

/**
 * <p>Fetches the metadata for a document with the given URI. Metadata document returned in result.doc
 * </p><p>
 * https://docs.marklogic.com/REST/GET/v1/documents
 *</p>
 * @param {string} docuri - The URI of the document whose metadata you want to retrieve.
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.metadata = function(docuri,callback_opt) {
  if (undefined == callback_opt && typeof(docuri)==='function') {
    callback_opt = docuri;
    docuri = undefined;
  }
  var options = {
    path: '/v1/documents?uri=' + encodeURI(docuri) + "&format=json&category=metadata",
    method: 'GET'
  };
  
  this.__doreq("METADATA",options,null,callback_opt);
};

/**
 * <p>Saves new docs with GUID-timestamp, new docs with specified id, or updates doc with specified id
 * NB handle json being an array of multiple docs rather than a single json doc
 * If no docuri is specified, one is generated by using a combination of the time and a large random number.
 *</p><p>
 * https://docs.marklogic.com/REST/PUT/v1/documents
 *</p><p>
 * props_opt can be used to provide extra options. These are:-</p>
 <ul><li>collection - The comma delimited string of the collections to add the document to
 *</li><li>
 *contentType - The content type (MIME type) of the doc. Useful for uploaded binary documents.
 *</li><li>
 *format - The format of the response. Either json (default if not specified) or xml.
 *</li><li>
 *permissions - array of permission JSON objects to apply: E.g. [{role: 'secret-write', permissions: 'update|read|delete'}, ...]
 *</li></ul>
 *
 * @param {json|xml|file} jsonXmlBinary - The document content to save
 * @param {string} docuri_opt - The optional URI of the document to create
 * @param {JSON} props_opt - The optional additional properties to use.
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.save = function(jsonXmlBinary,docuri_opt,props_opt,callback_opt) {
  if (undefined == callback_opt) {
    if (undefined != props_opt) {
      if (typeof(props_opt)==='function') {
        if (typeof(docuri_opt)==='string') {
          this.logger.debug("json,docuri,,callback");
          callback_opt = props_opt;
          props_opt = undefined;
        } else {
          this.logger.debug("json,,props,callback");
          callback_opt = props_opt;
          props_opt = docuri_opt;
          docuri_opt = undefined;
        }
      } else {
        this.logger.debug("json,docuri,props,");
        // do nothing
      }
    } else {
      if (undefined == docuri_opt) {
        this.logger.debug("json,,,");
        // do nothing
      } else {
        if(typeof(docuri_opt)=="function") {
          this.logger.debug("json,,,callback");
          callback_opt = docuri_opt;
          docuri_opt = undefined;
        } else {
          if (typeof(docuri_opt) === "string") {
            this.logger.debug("son,docuri,,");
            // do nothing
          } else {
            this.logger.debug("json,,props,");
            props_opt = docuri_opt;
            docuri_opt = undefined;
          }
        }
      }
    }
  } else {
   this.logger.debug("json,docuri,props,callback");
    // do nothing
  }
  
  if (undefined == docuri_opt) {
    // generate docuri and set on response object
    docuri_opt = this.__genid();
  }
  
  var format = "json";
  var contentType = null; // default to using format, above
  var url = "/v1/documents?uri=" + encodeURI(docuri_opt);
  if (props_opt) {
    if (props_opt.collection) {
      url += "&collection=" + encodeURI(props_opt.collection);
    }
    if (props_opt.contentType) {
      format = null;
      contentType = props_opt.contentType;
    }
    if (props_opt.format) {
      // most likely 'binary'
      format = props_opt.format;
    }
    if (props_opt.permissions) {
      // array of {role: name, permission: read|update|execute} objects
      for (var p = 0;p < props_opt.permissions.length;p++) {
        url += "&perm:" + props_opt.permissions[p].role + "=" + props_opt.permissions[p].permission;
      }
    }
  }
  if (null != format) {
    url += "&format=" + format;
  }
  // make transaction aware
  if (undefined != this.__transaction_id) {
    url += "&txid=" + encodeURI(this.__transaction_id);
  }
  
  var options = {
    path: url,
    method: 'PUT'
  };
  if (null != contentType) {
    options.contentType = contentType;
  }
  
  this.__doreq("SAVE",options,jsonXmlBinary,function(result) {
    result.docuri = docuri_opt;
    (callback_opt||noop)(result);
  });
};

/**
 * <p>Updates the document with the specified uri by only modifying the passed in properties.</p><p>
 * NB May not be possible in V6 REST API elegantly - may need to do a full fetch, update, save
 *</p>
 * @param {JSON} json - The JSON document to merge with the existing document
 * @param {string} docuri - The URI of the document to update
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.merge = function(json,docuri,callback_opt) { 
  // make transaction aware - automatically done by save
  var self = this;
  this.get(docuri,function(result) {
    var merged = result.doc;
    var res = {};
    res = self.__merge(merged,json);
    self.logger.debug("Merged JSON: " + JSON.stringify(res));
    //res = self.__merge(merged,json); // fix dboptions.concat in configure()
    self.save(res,docuri,callback_opt);
  });
};

mldb.prototype.__merge = function(json1,json2) {
  this.logger.debug("__merge: JSON json1: " + JSON.stringify(json1) + ", json2: " + JSON.stringify(json2));
  if (undefined == json1 && undefined != json2) {
    this.logger.debug("JSON1 undefined, returning: " + json2);
    return json2;
  } else if (undefined == json2 && undefined != json1) {
    this.logger.debug("JSON2 undefined, returning: " + json1);
    return json1;
  } else if (typeof(json1)==='object' && typeof(json2)==='object') {
    this.logger.debug("Both 1&2 are JSON objects. json1: " + JSON.stringify(json1) + ", json2: " + JSON.stringify(json2));
    // can be merged
    var merged = {};
    for (var k in json1) {
      merged[k] = json1[k];
    }
    for (var k in json2) {
      merged[k] = this.__merge(merged[k],json2[k]);
    }
    return merged;
  } else if (undefined == json1 && undefined == json2) {
    return undefined;
  } else {
    this.logger.debug("Both 1&2 are JSON values. json2 (newest): " + json2);
    // return the second (new) value
    return json2;
  }
};

/**
 * <p>Deletes the specified document
 * </p><p>
 * https://docs.marklogic.com/REST/DELETE/v1/documents
 *</p>
 * @param {string} docuri - URI of the document to delete
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */ 
mldb.prototype.delete = function(docuri,callback_opt) { 
  var url = '/v1/documents?uri=' + encodeURI(docuri);
  
  // make transaction aware
  if (undefined != this.__transaction_id) {
    url += "&txid=" + encodeURI(this.__transaction_id);
  }

  var options = {
    path: url,
    method: 'DELETE'
  };
  
  this.__doreq("DELETE",options,null,callback_opt);
};
mldb.prototype.remove = mldb.prototype.delete; // Convenience method for people with bad memories like me

/**
 * <p>Returns all documents in a collection, optionally matching against the specified fields
 * </p><p>http://docs.marklogic.com/REST/GET/v1/search
 * </p>
 * @param {string} collection - The collection to list documents from
 * @param {string} fields_opt - Not used
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.collect = function(collection,fields_opt,callback_opt) {
  if (callback_opt == undefined && typeof(fields_opt)==='function') {
    callback_opt = fields_opt;
    fields_opt = undefined;
  }
  var options = {
    path: "/v1/search?collection=" + encodeURI(collection) + "&format=json&view=results",
    method: "GET"
  };
  this.__doreq("COLLECT",options,null,callback_opt);
};

/**
 * <p>Lists all documents in a directory, to the specified depth (default: 1), optionally matching the specified fields</p><p>
 * http://docs.marklogic.com/REST/GET/v1/search
 * </p>
 * @param {string} directory - The directory URI to list documents within
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.list = function(directory,callback_opt) { 
  var options = {
    path: "/v1/search?directory=" + encodeURI(directory) + "&format=json&view=results",
    method: "GET"
  };
  this.__doreq("LIST",options,null,callback_opt);
};

/**
 * <p>Performs a simple key-value search. Of most use to JSON programmers.
 * </p><p>
 * https://docs.marklogic.com/REST/GET/v1/keyvalue
 *</p>
 * @param {string} key - The JSON key to use for document retrieval
 * @param {string} value - The value of the JSON key to match against candidate documents
 * @param {string} keytype_opt - What type to use for the key type. Defaults to 'key'. (i.e. JSON key, not element)
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.keyvalue = function(key,value,keytype_opt,callback_opt) {
  if (undefined == callback_opt && typeof(keytype_opt) === 'function') {
    callback_opt = keytype_opt;
    keytype_opt = undefined;
  }
  if (undefined == keytype_opt) {
    keytype_opt = "key"; // also element, attribute for xml searches
  }
  var url = "/v1/keyvalue?" + keytype_opt + "=" + encodeURI(key) + "&value=" + encodeURI(value) + "&format=json";
  
  // make transaction aware
  if (undefined != this.__transaction_id) {
    url += "&txid=" + encodeURI(this.__transaction_id);
  }
  
  var options = {
    path: url,
    method: "GET"
  };
  this.__doreq("KEYVALUE",options,null,callback_opt);
};

/**
 * <p>Performs a search:search via REST</p><p>
 * http://docs.marklogic.com/REST/GET/v1/search
 *</p><p>
 * See supported search grammar http://docs.marklogic.com/guide/search-dev/search-api#id_41745 
 * </p><p>
 * Supported values for sprops_opt:-</p>
 * <ul>
 *  <li>collection - The collection to restrict search results from</li>
 * <li>directory - The directory uri to restrict search results from</li>
 * <li>transform - The transform to apply to the top level results object on the server</li>
 * <li>format - The format of the response. json or xml. json is the default if not specified</li>
 *</ul>
 * @param {string} query_opt - The query string. Optional. (Returns all documents if not supplied, or whatever returns from the additional-query in the json options used)
 * @param {string} options_opt - The name of the installed options to use. Optional. In 0.7+ can also be a JSON options document, if used against MarkLogic 7
 * @param {positiveInteger} start_opt - Index of the first result to return in the page. First index is 1 (not 0). Defaults to 1 if not provided.
 * @param {JSON} sprops_opt - Additional optional search properties
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */ 
mldb.prototype.search = function(query_opt,options_opt,start_opt,sprops_opt,callback) { 
  this.logger.debug("*** start_opt: " + start_opt);
  if (callback == undefined && typeof(sprops_opt) === 'function') {
    callback = sprops_opt;
    sprops_opt = undefined;
  } else {
    if (callback == undefined && typeof(start_opt) === 'function') {
      callback = start_opt;
      start_opt = undefined;
    } else {
      if (callback == undefined && typeof(options_opt) === 'function') {
      callback = options_opt;
      options_opt = undefined;
      }
    }
  }
  var content = null;
  var method = "GET";
  var url = "/v1/search?q=" + encodeURI(query_opt) ;
  if (options_opt != undefined) {
    if (typeof options_opt === "string") {
      url += "&options=" + encodeURI(options_opt);
    }/* else {
      // add as content document
      content = options_opt;
      method = "POST"; // TODO verify
    }*/
  }
  var format = "&format=json";
  if (undefined != sprops_opt) {
    if (undefined != sprops_opt.collection) {
      url += "&collection=" + sprops_opt.collection;
    }
    if (undefined != sprops_opt.directory) {
      url += "&directory=" + sprops_opt.directory;
    }
    if (undefined != sprops_opt.transform) {
      // MarkLogic 7.0+ only
      url += "&transform=" + sprops_opt.transform;
    }
    if (undefined != sprops_opt.format) {
      format = "&format=" + sprops_opt.format;
    }
  }
  url += format;
  if (undefined != start_opt) {
    url += "&start=" + start_opt;
  }
  url += "&view=all";
  
  // TODO check options' type - if string, then pass as options param. If JSON object, then do POST to /v1/search to provide options dynamically
  
  // make transaction aware
  if (undefined != this.__transaction_id) {
    url += "&txid=" + encodeURI(this.__transaction_id);
  }
    
  var options = {
    path: url,
    method: method
  };
  var self = this;
  this.__doreq("SEARCH",options,content,function(result) {
    // Horrendous V7 EA1 workaround...
    if ("xml" == result.format) {
      self.logger.debug("result currently: " + JSON.stringify(result));
      // convert to json for now (quick in dirty)
      // TODO replace this with 'nice' fix for V7 transforms
      result.doc = xmlToJsonSearchResults(result.doc);
      result.format = "json";
      //if (undefined == result.doc.result) {
        result.doc = result.doc.response;
        result.doc.results = result.doc.result;
        result.doc.result = undefined;
        /*
        for (var i = 0;i < result.doc.results.length;i++) {
          result.doc.results[i].content = {html: result.doc.results[i].html};
          result.doc.results[i].html = undefined;
        }*/
      //}
      self.logger.debug("Result doc now: " + JSON.stringify(result.doc));
    }
    (callback||noop)(result);
  });
};

/**
 * <p>Performs a search:search via REST. Helper method for SEARCH.</p><p>
 * http://docs.marklogic.com/REST/GET/v1/search
 *</p><p>
 * See supported search grammar http://docs.marklogic.com/guide/search-dev/search-api#id_41745 
 *</p>
 * @param {string} collection_opt - The optional collection to restrict the results to
 * @param {string} query_opt - The optional query string
 * @param {string} options_opt - The optional name of the installed query options to use
 * @param {function} callback - The callback to invoke after the method completes
 */ 
mldb.prototype.searchCollection = function(collection_opt,query_opt,options_opt,callback) { 
  if (callback == undefined && typeof(options_opt) === 'function') {
    callback = options_opt;
    options_opt = undefined;
  }
  var url = "/v1/search?q=" + encodeURI(query_opt) + "&format=json";
  if (undefined != collection_opt) {
    url += "&collection=" + encodeURI(collection_opt);
  }
  if (options_opt != undefined) {
    url += "&options=" + encodeURI(options_opt);
  }
  
  // make transaction aware
  if (undefined != this.__transaction_id) {
    url += "&txid=" + encodeURI(this.__transaction_id);
  }
    
  var options = {
    path: url,
    method: "GET"
  };
  this.__doreq("SEARCHCOLLECTION",options,null,callback);
};

/**
 * <p>Performs a structured search.</p><p>
 * http://docs.marklogic.com/REST/GET/v1/search
 * </p><p>
 * Uses structured search instead of cts:query style searches. See http://docs.marklogic.com/guide/search-dev/search-api#id_53458
 * </p><p>
 * Use this method in conjunction with the Query Builder {@see mldb.prototype.query}
 *</p>
 * @param {string} query_opt - The optional query string to restrict the results by
 * @param {string} options_opt - The optional name of the installed query options to use
 * @param {function} callback - The callback to invoke after the method completes
 */
mldb.prototype.structuredSearch = function(query_opt,options_opt,callback) {
  if (callback == undefined && typeof(options_opt) === 'function') {
    callback = options_opt;
    options_opt = undefined;
  }
  var url = "/v1/search?structuredQuery=" + encodeURI(JSON.stringify(query_opt)) + "&format=json";
  if (options_opt != undefined) {
    url += "&options=" + encodeURI(options_opt);
  }
  
  // make transaction aware
  if (undefined != this.__transaction_id) {
    url += "&txid=" + encodeURI(this.__transaction_id);
  }
  
  var options = {
    path: url,
    method: "GET"
  };
  //console.log("OPTIONS: " + JSON.stringify(options));
  this.__doreq("SEARCH",options,null,callback);
};


/**
 * <p>Saves search options with the given name. These are referred to by mldb.structuredSearch.</p><p>
 * http://docs.marklogic.com/REST/PUT/v1/config/query/*
 *</p><p>
 * For structured search options see http://docs.marklogic.com/guide/rest-dev/search#id_48838
 * </p><p>
 * Use this function in conjunction with the Search Options Builder. {@see mldb.prototype.options}
 *</p>
 * @param {string} name - The name to install the search options under
 * @param {JSON} searchoptions - The search options JSON object. {@see mldb.prototype.options.prototype.toJson}
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.saveSearchOptions = function(name,searchoptions,callback_opt) {
  var options = {
    path: "/v1/config/query/" + name + "?format=json",
    method: "PUT"
  };
  this.__doreq("SAVESEARCHOPTIONS",options,searchoptions,callback_opt);
};

/**
 * <p>Fetches search options, if they exist, for the given search options name
 * http://docs.marklogic.com/REST/PUT/v1/config/query/*
 * </p><p>
 * For structured serch options see http://docs.marklogic.com/guide/rest-dev/search#id_48838
 *</p>
 * @param {string} name - The name of the installed search options to retrieve as JSON
 * @param {function} callback - The callback to invoke after the method completes
 */
mldb.prototype.searchoptions = function(name,callback) {
  var options = {
    path: "/v1/config/query/" + name + "?format=json",
    method: "GET"
  };
  this.__doreq("SEARCHOPTIONS",options,null,callback);
};

/**
 * <p>Fetches values from a lexicon or computes 2-way co-occurence.</p><p>
 * https://docs.marklogic.com/REST/GET/v1/values/*
 *</p>
 * @param {string|JSON} query - The query string (string) or structured query (object) to use to restrict the results
 * @param {string} tuplesname - The name of the tuples in the installed search options to return
 * @param {string} optionsname - The name of the installed search options to use
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.values = function(query,tuplesname,optionsname,callback_opt) {
  var options = {
    path: "/v1/values/" + tuplesname + "?format=json&options=" + encodeURI(optionsname),
    method: "GET"
  };
  if (typeof query == "string") {
    // plain text query
    options.path += "&q=" + encodeURI(query);
  } else if (typeof query == "object") {
    // structured query
    options.path += "&structuredQuery=" + encodeURI(JSON.stringify(query));
  }
  
  this.__doreq("VALUES",options,null,callback_opt);
};

/**
 * <p>Same functionality as values() but uses a combined search options and query mechanism.
 * This requires MarkLogic V7 EA 1 or above</p><p>
 * http://docs-ea.marklogic.com/REST/POST/v1/values/*
 * </p><p>
 * For structured serch options see http://docs.marklogic.com/guide/rest-dev/search#id_48838
 *</p><p>
 * Executes the values configuration provided. The name 'shotgun' used below is not important. {@see mldb.prototype.subcollections} for an example usage.
 *</p>
 * @param {JSON} search - The JSON structured search to use
 * @param {function} callback - The callback to invoke after the method completes
 */
mldb.prototype.valuesCombined = function(search,callback) {
  
  var options = {
    path: "/v1/values/shotgun?direction=ascending&view=values",
    method: "POST"
  };
  
  this.__doreq("VALUESCOMBINED",options,search,callback);
};

/**
 * <p>Lists the collection URIS underneath the parent uri.
 * Helper method to fetch collections from the collection lexicon using mldb.valuesCombined().
 *</p>
 * @param {string} parenturi - The collection URI under which to retrieve the list of subcollections
 * @param {function} callback - The callback to invoke after the method completes
 */
mldb.prototype.subcollections = function(parenturi,callback) {
  var values = {
    search: {
      "query": {
        "collection-query" : {
          uri: [parenturi]
        }
      },
      "options": {
        "values": [
          {
            "name": "childcollectionsvalues",
            "constraint": [
              {
                "name": "childcollections",
                "collection": {
                  "prefix": parenturi
                }
              }
            ]
          } 
        ]
      }
    }
  };
  
  var self = this;
  
  this.valuesCombined(values,function(result) {
    self.logger.debug("collection values result: " + JSON.stringify(result));
    if (result.inError) {
      callback(result);
    } else {
      // extract just the values collection and return that for simplicity
      var list = result["values-response"].value;
      var values = new Array();
      for (var i = 0;i < list.length;i++) {
        values.push(list[i][0]._value);
      }
      result.doc = {values: values};
      
      callback(result);
    }
  });
};



// VERSION 7 SEMANTIC CAPABILITIES
/**
 * <p>Saves a set of triples as an n-triples graph. Allows you to specify a named graph (collection) or use the default graph.
 * </p><p>
 * No documentation URL - still in Early Access, docs only available on internal MarkLogic wiki
 *</p><p>
 * I'm using an easy to interpret JSON triples format. This prevents the user of this function from having to know the
 * n-triples format. Here is an example:-
 * triples = [{subject: "http://someiri/#here", predicate: "http://someiri/#here", object: "http://someiri/#here"},... ]
 * </p><p>
 * Note: We assume that the 'object' if provided as JSON triples is an IRI, not a string or other primitive value.
 * Construct your own N-triples if you need to provide raw primitive values.
 *</p>
 * @param {string|JSON} triples - The raw N-triples (string) or JSON triples (object JSON array) to store
 * @param {string} uri_opt - The graph name to replace. If not provided, the default MarkLogic graph (all triples) will be replaced.
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.saveGraph = function(triples,uri_opt,callback_opt) {
  if (undefined == callback_opt && "function" === typeof uri_opt) {
    callback_opt = uri_opt;
    uri_opt = undefined;
  }
  
  var options = {
    path: "/v1/graphs", // EA nightly URL
    contentType: "text/plain",
    method: "PUT"
  }
  if (undefined != uri_opt) {
    options.path += "?graph=" + encodeURI(uri_opt);
  } else {
    options.path += "?default";
  }
  // create a graph doc
  var graphdoc = "";
  if ("object" === typeof triples) {
    for (var i = 0;i < triples.length;i++) {
      graphdoc += "<" + triples[i].subject + "> <" + triples[i].predicate + "> <" + triples[i].object + "> .\n";
    }
  } else {
    graphdoc = triples; // raw text in n-triples format
  }
  this.__doreq("SAVEGRAPH",options,graphdoc,callback_opt);
};

/**
 * <p>Merges a set of triples in to an n-triples graph. Allows you to specify a named graph (collection) or use the default graph.
 * </p><p>
 * No documentation URL - still in Early Access
 *</p>
 * @param {string|JSON} triples - The raw N-triples (string) or JSON triples (object JSON array) to store
 * @param {string} uri_opt - The graph name to replace. If not provided, the default MarkLogic graph (all triples) will be merged.
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.mergeGraph = function(triples,uri_opt,callback_opt) {
  if (undefined == callback_opt && "function" === typeof uri_opt) {
    callback_opt = uri_opt;
    uri_opt = undefined;
  }
  
  var options = {
    path: "/v1/graph",
    contentType: "text/plain",
    method: "POST"
  }
  if (undefined != uri_opt) {
    options.path += "?graph=" + encodeURI(uri_opt);
  } else {
    options.path += "?default";
  }
  // create a graph doc
  var graphdoc = "";
  if ("object" === typeof triples) {
    for (var i = 0;i < triples.length;i++) {
      graphdoc += "<" + triples[i].subject + "> <" + triples[i].predicate + "> <" + triples[i].object + "> .\n";
    }
  } else {
    graphdoc = triples; // raw text in n-triples format
  }
  this.__doreq("MERGEGRAPH",options,graphdoc,callback_opt);
};

/**
 * <p>Returns the specified graph from MarkLogic Server, or the full default graph. USE CAREFULLY!</p><p>
 * Returns the triples as a JSON {subject: "...", predicate: "...", object: "..."} array in result.triples, or the raw in result.doc
 *</p><p>
 * No documentation URL - still in Early Access
 *</p>
 * @param {string} uri_opt - The name of the grah to return. If not provided, the default MarkLogic graph (all triples, not just triples not in a named graph) will be returned.
 * @param {function} callback_opt - The optional callback to invoke after the method completes.
 */
mldb.prototype.graph = function(uri_opt,callback_opt) {
  if (undefined == callback_opt && "function" === typeof uri_opt) {
    callback_opt = uri_opt;
    uri_opt = undefined;
  }
  
  var options = {
    path: "/v1/graph",
    method: "GET"
  }
  if (undefined != uri_opt) {
    options.path += "?graph=" + encodeURI(uri_opt);
  } else {
    options.path += "?default";
  }
  
  this.__doreq("GETGRAPH",options,null,function(result) {
    if (result.inError) {
      (callback_opt||noop)(result);
    } else {
      // convert to JSON array representation
      var lines = result.doc.split("\n");
      var triples = new Array();
      var spos,ppos,opos,send,pend,oend,line;
      for (var l = 0;l < lines.length;l++) {
        line = lines[l];
        spos = line.indexOf("<");
        send = line.indexOf(">",spos + 1);
        ppos = line.indexOf("<",send + 1);
        pend = line.indexOf(">",ppos + 1);
        opos = line.indexOf("<",pend + 1);
        oend = line.indexOf(">",opos + 1);
        triples.push({subject: line.substring(spos + 1,send), predicate: line.substring(ppos + 1,pend), object: line.substring(opos + 1,oend)});
      }
      result.triples = triples;
      (callback||noop)(result);
    }
  });
};

/**
 * <p>Deletes the specified graph from MarkLogic Server
 *</p><p>
 * No documentation URL - still in Early Access
 *</p>
 * @param {string} uri - The name of the graph to delete. Required. (Cannot be 'default')
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.deleteGraph = function(uri,callback_opt) {
  var options = {
    path: "/v1/graph?graph=" + encodeURI(uri),
    method: "DELETE"
  };
  
  this.__doreq("DELETEGRAPH",options,null,callback_opt);
};

/**
 * <p>Executes the specified sparql query.
 *</p><p>
 * No documentation URL - still in Early Access
 *</p>
 *
 * @param {string} sparql - The sparql query text
 * @param {function} callback - The callback to invoke after the method completes.
 */
mldb.prototype.sparql = function(sparql,callback) {
  var options = {
    path: "/v1/graphs/sparql",
    method: "POST",
    contentType: "text/plain",
    headers: []
    /*
    path: "/v1/graphs/sparql?query=" + encodeURI(sparql),
    method: "GET"
    */
  };
  options.headers["Accept"] = "application/sparql-results+json";
  //options.headers["Content-Type"] = "text/plain";
  
  this.__doreq("SPARQL",options,sparql,callback);
};



// TRANSACTION MANAGEMENT







/**
 * <p>Opens a new transaction. Optionally, specify your own name.</p><p>
 * http://docs.marklogic.com/REST/POST/v1/transactions
 *</p><p>
 * Note: Each mldb instance can only have one live transaction at a time. This is a limit imposed by myself by design, not by the underlying REST API. 
 * Best to configure a connection per real user-application pair.
 *</p>
 * @param {string} name_opt - The name of the transaction. If not provided, 'client-txn' will be used. Likely not safe on a multi user system.
 * @param {function} callback - The callback to invoke after the method completes
 */
mldb.prototype.beginTransaction = function(name_opt,callback) {
  if (undefined == callback && typeof(name_opt)==='function') {
    callback = name_opt;
    name_opt = undefined;
  }
  
  // ensure a transaction ID is not currently open
  if (undefined != this.__transaction_id) {
    var result = {inError:true,error: "This DB instance has an open transaction. Multiple transactions not supported in this version of MLDB."};
    (callback||noop)(result);
  } else {
    // temporary workaround for not having a mechanism to retrieve the Location header
    if (undefined == name_opt) {
      name_opt = "client-txn"; // same as server default
    }
    var url = "/v1/transactions";
    if (undefined != name_opt) { /* always true. Kept for sanity check in case we alter preceding if statement. */
      url += "?name=" + encodeURI(name_opt);
      //this.__transaction_id = name_opt;
    }
    var options = {
      path: url,
      method: "POST"
    };
    var self = this;
    this.__doreq("BEGINTRANS",options,null,function(result){
      // if error, remove txid
      if (result.inError) {
        self.__transaction_id = undefined;
      } else {
        self.__transaction_id = result.location.substring(17); // txid is in the Location header after /v1/transactions/
        self.logger.debug("Created transaction id: " + result.location);
      }
      
      result.txid = self.__transaction_id;
    
      // call callback
      (callback||noop)(result);
    }); 
  }
};
mldb.prototype.begin = mldb.prototype.beginTransaction;

/**
 * <p>Commits the open transaction</p><p>
 * http://docs.marklogic.com/REST/POST/v1/transactions/*
 *</p>
 * @param {function} callback - The callback to invoke after the method completes
 */
mldb.prototype.commitTransaction = function(callback) {
  var options = {
    path: "/v1/transactions/" + this.__transaction_id + "?result=commit",
    method: "POST"
  };
  this.__transaction_id = undefined;
  this.__doreq("COMMITTRANS",options,null,callback);
};
mldb.prototype.commit = mldb.prototype.commitTransaction;

/**
 * <p>Rolls back the open transaction.</p><p>
 * http://docs.marklogic.com/REST/POST/v1/transactions/*
 *</p>
 * @param {function} callback - The callback to invoke after the method completes
 */
mldb.prototype.rollbackTransaction = function(callback) {
  var options = {
    path: "/v1/transactions/" + this.__transaction_id + "?result=rollback",
    method: "POST"
  };  
  this.__transaction_id = undefined;
  this.__doreq("ABANDONTRANS",options,null,callback);
};
mldb.prototype.rollback = mldb.prototype.rollbackTransaction;







// DRIVER HELPER FEATURES







/**
 * <p>Generic wrapper to wrap any mldb code you wish to execute in parallel. E.g. uploading a mahoosive CSV file. Wrap ingestcsv with this and watch it fly!</p><p>
 * NOTE: By default all E-node (app server requests, like the ones issued by this JavaScript wrapper) are executed in a map-reduce style. That is to say
 * they are highly parallelised by the server, automatically, if in a clustered environment. This is NOT what the fast function does. The fast function
 * is intended to wrap utility functionality (like CSV upload) where it may be possible to make throughput gains by running items in parallel. This is
 * akin to ML Content Pump (mlcp)'s -thread_count and -transaction_size ingestion options. See defaultdboptions for details
 * </p>
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.fast = function(callback_opt) {
  this.__fast = true;
  (callback_opt||noop)({inError:false,fast: true});
};







// UTILITY METHODS







/**
 * <p>Takes a csv file and adds to the database.
 * fast aware method
 *</p><p>
 * NOT YET IMPLEMENTED - Shell function only that will never call the callback
 * </p>
 * @param {string} csvdata - The CSV text to ingest
 * @param {string} docid_opt - The optional URI of the document to store
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.ingestcsv = function(csvdata,docid_opt,callback_opt) {
  
};

/**
 * <p>Inserts many JSON documents. FAST aware, TRANSACTION aware.
 *</p>
 * @param {Array} doc_array - The array of document data to store. {@see mldb.prototype.save} for valid values
 * @param {Array} uri_array_opt - The optional array of URIs to store the documents as. Will generate if not provided
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.saveAll = function(doc_array,uri_array_opt,callback_opt) {
  if (callback_opt == undefined && typeof(uri_array_opt)==='function') {
    callback_opt = uri_array_opt;
    uri_array_opt = undefined;
  }
  if (undefined == uri_array_opt) {
    uri_array_opt = new Array();
    for (var i = 0;i < doc_array.length;i++) {
      uri_array_opt[i] = this.__genid();
    }
  }
  
  // TODO make fast aware
  // TODO make transaction aware (auto by using save - need to check for error on return. pass error up for auto rollback)
  var error = null;
  for (var i = 0;null == error && i < doc_array.length;i++) {
    this.save(doc_array[i],uri_array_opt[i],function(result) {
      if (result.inError) {
        error = result;
      }
    });
  }
  if (null == error) {
    (callback_opt||noop)({inError: false,docuris: uri_array_opt});
  } else {
    (callback_opt||noop)(error);
  }
};

var rv = function(totalruns,maxrunning,start_func,finish_func,complete_func) {
  this.running = 0;
  this.runnercount = 0;
  this.cancelled = false;
  this.maxrunning = maxrunning;
  this.sf = start_func;
  this.ff = finish_func;
  this.cf = complete_func;
  this.totalruns = totalruns;
};

rv.prototype.run = function() {
  this.cancelled = false;
  for (var i = 0;i < this.maxrunning;i++) {
    this._start();
  }
};

rv.prototype.cancel = function() {
  this.cancelled = true;
}

rv.prototype._start = function() {
  this.running++;
  var that = this;
  var mc = this.runnercount++;
  this.sf(mc,function(mc,result) {
    that.callback(mc,result,that);
  });
};

rv.prototype.callback = function(mc,result,that) {
  that.running--;
  that.ff(mc,result);
  if (that.runnercount == that.totalruns) {
    that.cf();
    that.runnercount++; // should never happen, but just ensuring an infinite loop does not happen if this is coded wrong somewhere
  } else if (!that.cancelled && that.running < that.maxrunning && that.runnercount < that.totalruns) {
    that._start();
  }
};

/**
 * <p>Alternative saveAll function that throttles invoking MarkLogic to a maximum number of simultaneous 'parallel' requests. (JavaScript is never truly parallel)
 *</p><p>
 * NB Uses an internal rv class defined in the mldb.js file.
 *</p>
 * @param {Array} doc_array - The array of document data to store. {@see mldb.prototype.save} for valid values
 * @param {Array} uri_array_opt - The optional array of URIs to store the documents as. Will generate if not provided
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.saveAll2 = function(doc_array,uri_array_opt,callback_opt) {
  if (callback_opt == undefined && typeof(uri_array_opt)==='function') {
    callback_opt = uri_array_opt;
    uri_array_opt = undefined;
  }
  if (undefined == uri_array_opt) {
    uri_array_opt = new Array();
    for (var i = 0;i < doc_array.length;i++) {
      uri_array_opt[i] = this.__genid();
    }
  }
  
  // TODO make fast aware
  // TODO make transaction aware (auto by using save - need to check for error on return. pass error up for auto rollback)
  var error = null;
  //for (var i = 0;null == error && i < doc_array.length;i++) {
  var that = this;
  var start_func = function(mc,callback) {
    that.save(doc_array[mc],uri_array_opt[mc],callback);
  };
  var finish_func = function(result) {
    if (result.inError) {
      error = result;
    }
  };
  
  var complete_func = function() {
    if (null == error) {
      (callback_opt||noop)({inError: false,docuris: uri_array_opt});
    } else {
      (callback_opt||noop)(error);
    }
  };
  
  var myrv = new rv(doc_array.length,this.dboptions.fastparts,start_func,finish_func,complete_func);
  myrv.run();
  
};




// REST API EXTENSIONS

// START EXTENSION 
/**
 * <p>REQUIRES CUSTOM REST API EXTENSION - subscribe-resource.xqy - Adam Fowler adam.fowler@marklogic.com - Save searches by name, and subscribe to alerts from them. Alerts sent to a given URL.
 *  </p><p>
 * Save a query as an XML document using the default search grammar (see search:search) with a given name
 *</p>
 * @param {string} searchname - The name of the search
 * @param {boolean} shared - If false, the current user's username is prepended to the search name with a hyphen
 * @param {string} query - The search:search compatible query using the default grammar to use for the search
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.saveBasicSearch = function(searchname,shared,query,callback_opt) {
  this._doSaveBasicSearch(searchname,shared,query,"search",null,callback_opt);
};

mldb.prototype._doSaveBasicSearch = function(searchname,shared,query,createmode,notificationurl,callback_opt) {
  var url = "/v1/resources/subscribe?notificationurl=" + encodeURI(notificationurl) + "&format=json&searchname=" + encodeURI(searchname) + 
    "&create=" + encodeURI(createmode) + "&shared=" + encodeURI(shared) + "&query=" + encodeURI(query) + "&querytype=basic";
  if ("both" == createmode) {
    url += "&notificationurl=" + encodeURI(notificationurl);
  }
    
  var options = {
    path: url,
    method: "PUT"
  };
  this.__doreq("SAVEBASICSEARCH",options,null,callback_opt);
};

/**
 * <p>REQUIRES CUSTOM REST API EXTENSION - subscribe-resource.xqy - Adam Fowler adam.fowler@marklogic.com - Save searches by name, and subscribe to alerts from them. Alerts sent to a given URL.
 *</p><p>
 * Save a query that matches documents created within a collection, with a given name
 *</p>
 * @param {string} searchname - The name of the search
 * @param {boolean} shared - If false, the current user's username is prepended to the search name with a hyphen
 * @param {string} collection - The collection to restrict search results to
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.saveCollectionSearch = function(searchname,shared,collection,callback_opt) {
  this._doSaveCollectionSearch(searchname,shared,collection,"search",null,callback_opt);
};

mldb.prototype._doSaveCollectionSearch = function(searchname,shared,collection,createmode,notificationurl,callback_opt) {
  var url = "/v1/resources/subscribe?notificationurl=" + encodeURI(notificationurl) + "&format=json&searchname=" + encodeURI(searchname) + 
    "&create=" + encodeURI(createmode) + "&shared=" + encodeURI(shared) + "&collection=" + encodeURI(collection) + "&querytype=collection";
  if ("both" == createmode) {
    url += "&notificationurl=" + encodeURI(notificationurl);
  }
    
  var options = {
    path: url,
    method: "PUT"
  };
  this.__doreq("SAVECOLLECTIONSEARCH",options,null,callback_opt);
};

/**
 * <p>REQUIRES CUSTOM REST API EXTENSION - subscribe-resource.xqy - Adam Fowler adam.fowler@marklogic.com - Save searches by name, and subscribe to alerts from them. Alerts sent to a given URL.
 *</p><p>
 * Save a geospatial search based on a point and radius from it, with a given name</p><p>
 * TODO check if we need to include an alert module name in the options
 *</p>
 * @param {string} searchname - The name of the search
 * @param {boolean} shared - If false, the current user's username is prepended to the search name with a hyphen
 * @param {decimal} latitude - The WGS84 latitude for the centre of the radius search
 * @param {decimal} longitude - The WGS84 longitude for the centre of the radius search
 * @param {decimal} radius - The radius in statue (nor nautical) miles
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.saveGeoNearSearch = function(searchname,shared,latitude,longitude,radiusmiles,callback_opt) {
  this._doSaveGeoNearSearch(searchname,shared,latitude,longitude,radiusmiles,"search",null,callback_opt);
};

mldb.prototype._doSaveGeoNearSearch = function(searchname,shared,latitude,longitude,radiusmiles,createmode,notificationurl,callback_opt) {
  var url = "/v1/resources/subscribe?notificationurl=" + encodeURI(notificationurl) + "&format=json&searchname=" + encodeURI(searchname) + 
    "&create=" + encodeURI(createmode) + "&shared=" + encodeURI(shared) + "&lat=" + encodeURI(latitude)  + "&lon=" + encodeURI(longitude)  + "&radiusmiles=" + encodeURI(radiusmiles) + "&querytype=geonear";
  if ("both" == createmode) {
    url += "&notificationurl=" + encodeURI(notificationurl);
  }
    
  var options = {
    path: url,
    method: "PUT"
  };
  this.__doreq("SAVEGEONEARSEARCH",options,null,callback_opt);
};

/**
 * <p>REQUIRES CUSTOM REST API EXTENSION - subscribe-resource.xqy - Adam Fowler adam.fowler@marklogic.com - Save searches by name, and subscribe to alerts from them. Alerts sent to a given URL.
 *</p><p>
 * Save an arbitrary search (any cts:query) already stored in the database, with a given name. Enables easy referencing and activation of alerts on this search.
 *</p>
 * @param {string} searchname - The name of the search
 * @param {boolean} shared - If false, the current user's username is prepended to the search name with a hyphen
 * @param {string} searchdocuri - The URI to copy the search document from
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.saveExistingSearch = function(searchname,shared,searchdocuri,callback_opt) {
  this._doSaveExistingSearch(searchname,shared,searchdocuri,"search",null,callback_opt)
};

mldb.prototype._doSaveExistingSearch = function(searchname,shared,searchdocuri,createmode,notificationurl,callback_opt) {
  var url = "/v1/resources/subscribe?notificationurl=" + encodeURI(notificationurl) + "&format=json&searchname=" + encodeURI(searchname) + 
    "&create=" + encodeURI(createmode) + "&shared=" + encodeURI(shared) + "&searchdocuri=" + encodeURI(searchdocuri) + "&querytype=uri";
  if ("both" == createmode) {
    url += "&notificationurl=" + encodeURI(notificationurl);
  }
    
  var options = {
    path: url,
    method: "PUT"
  };
  this.__doreq("SAVEEXISTINGSEARCH",options,null,callback_opt);
};

/*
 * TODO create-and-subscribe methods, subscribe to uri method
 */

/**
 * <p>REQUIRES CUSTOM REST API EXTENSION - subscribe-resource.xqy - Adam Fowler adam.fowler@marklogic.com - Save searches by name, and subscribe to alerts from them. Alerts sent to a given URL.
 *</p><p>
 * Uses Adam Fowler's (me!) REST API extension for subscribing to searches. RESTful HTTP calls are sent with the new information to the specified url.
 *</p>
 * @param {string} notificationurl - The RESTful URL to invoke with a PUT to send the matching document to
 * @param {string} searchname - The name of the search
 * @param {object} detail - The extra details to pass to the alert handler
 * @param {string} contenttype - Either json (default) or xml. If JSON, uses a basic V6 JSON configuration to convert all documents to.
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.subscribe = function(notificationurl,searchname,detail,contenttype,callback_opt) {
  var url = "/v1/resources/subscribe?notificationurl=" + encodeURI(notificationurl) + "&format=json&searchname=" + encodeURI(searchname) + 
    "&detail=" + encodeURI(detail) + "&contenttype=" + encodeURI(contenttype);
    
  var options = {
    path: url,
    method: "POST"
  };
  this.__doreq("SUBSCRIBE",options,null,callback_opt);
};

/**
 * <p>REQUIRES CUSTOM REST API EXTENSION - subscribe-resource.xqy - Adam Fowler adam.fowler@marklogic.com - Save searches by name, and subscribe to alerts from them. Alerts sent to a given URL.
 *</p><p>
 * Unsubscribe a notificationurl from a named search. Uses Adam Fowler's (me!) REST API extension.
 *</p>
 * @param {string} notificationurl - The RESTful URL to invoke with a PUT to send the matching document to
 * @param {string} searchname - The name of the search
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.unsubscribe = function(notificationurl,searchname,callback_opt) {
  var url = "/v1/resources/subscribe?notificationurl=" + encodeURI(notificationurl) + "&format=json&searchname=" + encodeURI(searchname) + "&delete=search";
    
  var options = {
    path: url,
    method: "DELETE"
  };
  this.__doreq("UNSUBSCRIBE",options,null,callback_opt);
};

/**
 * <p>REQUIRES CUSTOM REST API EXTENSION - subscribe-resource.xqy - Adam Fowler adam.fowler@marklogic.com - Save searches by name, and subscribe to alerts from them. Alerts sent to a given URL.
 *</p><p>
 * Unsubscribe from an alert and delete the underlying saved search. Convenience method.
 *</p>
 * @param {string} notificationurl - The RESTful URL to invoke with a PUT to send the matching document to
 * @param {string} searchname - The name of the search
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.unsubscribeAndDelete = function(notificationurl,searchname,callback_opt) {
  var url = "/v1/resources/subscribe?notificationurl=" + encodeURI(notificationurl) + "&format=json&searchname=" + encodeURI(searchname) + "&delete=both";
    
  var options = {
    path: url,
    method: "DELETE"
  };
  this.__doreq("UNSUBSCRIBE",options,null,callback_opt);
};

/**
 * <p>REQUIRES CUSTOM REST API EXTENSION - subscribe-resource.xqy - Adam Fowler adam.fowler@marklogic.com - Save searches by name, and subscribe to alerts from them. Alerts sent to a given URL.
 *</p><p>
 * Delete the saved search. Assumes already unsubscribed from alerts used by it. (If not, alerts will still fire!)
 *</p>
 * @param {string} searchname - The name of the search
 * @param {function} callback_opt - The optional callback to invoke after the method completes
 */
mldb.prototype.deleteSavedSearch = function(searchname,callback_opt) {
  var url = "/v1/resources/subscribe?format=json&searchname=" + encodeURI(searchname) + "&delete=search";
    
  var options = {
    path: url,
    method: "DELETE"
  };
  this.__doreq("DELETESAVEDSEARCH",options,null,callback_opt);
};

// END EXTENSION - subscribe-resource.xqy - Adam Fowler adam.fowler@marklogic.com - Save searches by name, and subscribe to alerts from them. Alerts sent to a given URL.


/**
 * <p>REQUIRES CUSTOM REST API EXTENSION - whoami.xqy - Adam Fowler adam.fowler@marklogic.com - Fetches information on the name and roles of the currently logged in client api user.
 *</p><p>
 * Fetches information about the user behind the current session.
 *</p><p>
 * Useful is your webapp performs the login so your javascript doesn't know your username. Also looks up roles.
 *</p>
 * @param {function} callback - The callback to invoke after the method completes
 */
mldb.prototype.whoami = function(callback) {
  var options = {
    path: "/v1/resources/whoami",
    method: "GET"
  };
  this.__doreq("WHOAMI",options,null,callback);
};


mldb.prototype.dlsdeclare = function(uri_or_uris,collection,callback) {
  /*
  var path = "/v1/resources/dls?rs:collection=" + encodeURI("/records/" + decname) + "&rs:uri=";
  var dlsoptions = {
        path: path + encodeURI(lastResults.results[i].uri),
        method: "PUT"
      };
      this.__doreq("DLSDECLARE",dlsoptions,null,function(result) {
        if (result.inError) {
          console.log("ERROR: " + JSON.stringify(result.details));
        } else {
          declCount++;
        }
        if (declCount == total) {
          done();
        }
      });
      */
       // TODO FIX THIS MESS
};

mldb.prototype.dlscollections = function(callback) {
  var options = {
    path: "/v1/resources/dls",
    method: "GET"
  };
  this.__doreq("DLSCOLLECTIONS",options,null,callback);
};


mldb.prototype.dlscollection = function(collection,callback) {
  var options = {
    path: "/v1/resources/dls?rs:collection=" + encodeURI(collection),
    method: "GET"
  };
  this.__doreq("DLSCOLLECTION",options,null,callback);
};



mldb.prototype.dlsrules = function(callback) {
  var options = {
    path: "/v1/resources/dlsrules",
    method: "GET"
  };
  this.__doreq("DLSRULES",options,null,callback);
};


mldb.prototype.dlsrule = function(name,callback) {
  var options = {
    path: "/v1/resources/dlsrules?rs:rulename=" + encodeURI(name),
    method: "GET"
  };
  this.__doreq("DLSRULE",options,null,callback);
};











/****
 * Search Options management
 ****/
 
/**
 * <p>Creates a new search options builder connected to this client database connection mldb instance. Each function returns a reference to the option builder object to support chaining.
 * </p><p><b>Note: I believe all search options are covered in the methods. If you find anything missing, or want a helper function, let me know.</b></p><p>
 * Applies the following sensible defaults:-</p>
 <ul>
 <li>  type = "xs:string"</li>
  <li> collation = "http://marklogic.com/collation/"</li>
  <li> namespace = "http://marklogic.com/xdmp/json/basic"</li>
  <li> sortDirection = "ascending"</li>
  <li> transform-results = "raw" (Note: Default elsewhere in marklogic is 'snippet' instead)</li>
  <li> page-length = 10</li>
 </ul>
 * 
  <h3>Sample usage 1: page-search.js:- (and page-chartsearch except without .pageLength(100) )</h3>
 <pre>
  var ob = new db.options();
  ob.defaultCollation("http://marklogic.com/collation/en")
    //.defaultType("xs:string"); // this should be the default anyway 
    //.defaultNamespace("http://marklogic.com/xdmp/json/basic") // this should be the default anyway 
    //.defaultSortDirection("ascending") // this should be the default anyway 
    //.sortOrderScore() // include by default? have .sortOrderClear() to remove? 
    //.sortOrder("family") // defaults to a json-key, type string, default collation, direction ascending 
    //.sortOrder("animal") // defaults to a json-key, type string, default collation, direction ascending. define sort order defaults anyway for each constraint??? 
    .collectionConstraint() // default constraint name of 'collection' 
    .rangeConstraint("animal",["item-order"]) // constraint name defaults to that of the range element name 
    .rangeConstraint("family",["item-frequency"]); // constraint name defaults to that of the range element name 
 </pre>
 *
  <h3>Sample usage 2: page-movies.js</h3>
  <pre>
  var ob = new db.options();
  ob.tuples("coag","actor","genre"); // first is tuple name. defaults to string, json namespace
  var ob2 = new db.options();
  ob2.tuples("coay","actor","year"); // first is tuple name. defaults to string, json namespace
  </pre>
 *
 * @constructor
 */
mldb.prototype.options = function() {
  this.options = {};
  this.options["concurrency-level"] = undefined;
  this.options.debug = false;
  this.options["extract-metadata"] = undefined; //extract-metadata
  this.options.forest = undefined; // unsigned long,
  this.options["fragment-scope"] = undefined; //string,
  this.options["searchable-expression"] = undefined; // { path-expression }
  this.options.term = undefined; // term-definition,
  this.options.tuples = undefined; // values-or-tuples,
  this.options.values = undefined; // values-or-tuples 
  
  // general defaults
  this.defaults = {};
  this.defaults.type = "xs:string";
  this.defaults.collation = "http://marklogic.com/collation/";
  this.defaults.namespace = "http://marklogic.com/xdmp/json/basic";
  this.defaults.sortDirection = "ascending";
  this.defaults.facetOption = undefined; // limit=10
};

mldb.prototype.options.prototype._includeSearchDefaults = function() {
  // called by any functions that specify search features 
  if (undefined == this.options["page-length"] || undefined == this.options.constraint) { // means none of these are defined
    this.options["transform-results"] = {apply: "raw"}; // transform-results,  
    this.options.constraint = new Array(); // [constraint]
    this.options["default-suggestion-source"] = new Array(); // [suggestion-source]
    this.options["additional-query"] = new Array(); // [string]
    this.options.grammar = undefined; //grammar,
    this.options.operator = new Array(); // [ operator ],
    this.options["page-length"] = 10; //unsigned long,
    this.options["quality-weight"] = undefined;// double,
    this.options["return-aggregates"] = false; // boolean,
    this.options["return-constraints"] = false;// boolean,
    this.options["return-facets"] = true; // boolean,
    this.options["return-frequencies"] = false; // boolean,
    this.options["return-metrics"] = true; // boolean,
    this.options["return-plan"] = false; // boolean,
    this.options["return-qtext"] = true; // boolean
    this.options["return-query"] = false; // boolean,
    this.options["return-results"] = true; // boolean,
    this.options["return-similar"] = false; // boolean,
    this.options["return-values"] = false; // boolean,
    this.options["search-option"] = new Array(); // [ string ],
    this.options["sort-order"] = new Array(); // [ sort-order ],
    this.options["suggestion-source"] = new Array(); //[ suggestion-source ],
    
    // defaults
    this.sortOrderScore();
  }
};

/**
 * Returns the JSON search options object needed by the REST API and generated by this class
 */
mldb.prototype.options.prototype.toJson = function() {
  // set empty arrays to undefined
//  if (undefined != this.options[""])
  
  // return options object
  return {options: this.options};
};

/**
 * Specifies the additional query to use to filter any search results
 * 
 * @param {string} str - The additional query string (XML string of a CTS query) to use
 */
mldb.prototype.options.prototype.additionalQuery = function(str) {
  this._includeSearchDefaults();
  this.options["additional-query"] = str;
  return this;
};

/**
 * Sets additional query to one that ensures no DLS declared document versions are returned (except the latest version at the original URL).
 */
mldb.prototype.options.prototype.noDLSVersions = function() {
  this._includeSearchDefaults();
  // NB the registered query in the below is the dls-documents-query()
  // TODO test on other databases without changing IDs
  this.options["additional-query"] = 
    "<cts:or-query xmlns:cts='http://marklogic.com/cts'><cts:not-query><cts:or-query><cts:properties-query><cts:registered-query><cts:id>17524193535823153377</cts:id></cts:registered-query></cts:properties-query>  <cts:properties-query><cts:not-query><cts:element-value-query><cts:element xmlns:dls='http://marklogic.com/xdmp/dls'>dls:annotation</cts:element></cts:element-value-query> </cts:not-query></cts:properties-query></cts:or-query></cts:not-query><cts:properties-query><cts:registered-query><cts:id>17524193535823153377</cts:id></cts:registered-query></cts:properties-query></cts:or-query>";
  return this;
};

/**
 * Specified the concurrency level option
 * 
 * @param {string} level - REST API concurrency level to use
 */
mldb.prototype.options.prototype.concurrencyLevel = function(level) {
  this.options["concurrency-level"] = level;
  return this;
};

/**
 * Specified the debug level for the search
 * 
 * @param {string} dbg - Search API debug level to use
 */
mldb.prototype.options.prototype.debug = function(dbg) {
  this.options.debug = dbg;
};

/**
 * Specified the forest to search within
 * 
 * @param {positiveInteger|Array} - Which forest(s) to use. (Note: MarkLogic internal IDs can overload JavaScript's numeric types so must be used with caution.)
 */
mldb.prototype.options.prototype.forest = function(forests) {
  if (Array.isArray(forests)) {
    this.options.forest = forests;
  } else {
    // assume single forest id
    this.options.forest = [forest];
  }
  return this;
};

/**
 * Specified the fragment scope
 * 
 * @param {string} scope - Function scope to use
 */
mldb.prototype.options.prototype.fragmentScope = function(scope) {
  this.options["fragment-scope"] = scope;
  return this;
};

/**
 * Specified the quality weight
 * 
 * @param {double} weight - Default search weight to use.
 */
mldb.prototype.options.prototype.qualityWeight = function(weight) {
  this.options["quality-weight"] = weight;
  return this;
};

/**
 * Specified whether to return aggregates
 * 
 * @param {boolean} ret - Whether to return aggregate values.
 */
mldb.prototype.options.prototype.returnAggregates = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-aggregates"] = ret;
  return this;
};

/**
 * Specified whether to return constraints
 * 
 * @param {boolean} ret - Whether to return query constraint settings in the response.
 */
mldb.prototype.options.prototype.returnConstraints = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-constraints"] = ret;
  return this;
};

/**
 * Specified whether to return facets
 * 
 * @param {boolean} ret - Whether to return facets
 */
mldb.prototype.options.prototype.returnFacets = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-facets"] = ret;
  return true;
};

/**
 * Specified whether to return frequencies
 * 
 * @param {boolean} ret - Whether to return Frequencies
 */
mldb.prototype.options.prototype.returnFrequencies = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-frequencies"] = ret;
  return this;
};

/**
 * Specified whether to return search metrics
 * 
 * @param {boolean} ret - Whether to return search metrics.
 */
mldb.prototype.options.prototype.returnMetrics = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-metrics"] = ret;
  return this;
};

/**
 * Specifies whether to return the internal search plan generated by the search query (Useful to debug poorly performing queries)
 * 
 * @param {boolean} ret - Whether to return the internal search API plan. Useful to debug search performance issues.
 */
mldb.prototype.options.prototype.returnPlan = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-plan"] = ret;
  return this;
};

/**
 * Specifies whether to return the query text with the search results
 * 
 * @param {boolean} ret - Whether to returnthe query text with the response.
 */
mldb.prototype.options.prototype.returnQtext = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-qtext"] = ret;
  return this;
};

/**
 * Specifies whether to return the entire query with the search results
 * 
 * @param {boolean} ret - Whether to return th query with the response.
 */
mldb.prototype.options.prototype.returnQuery = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-query"] = ret;
  return this;
};

/**
 * Specifies whether to return search result documents (or snippets thereof)
 * 
 * @param {boolean} ret - Whether to return search results. (Useful if you're just doing a values() co-occurence or lexicon lookup)
 */
mldb.prototype.options.prototype.returnResults = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-results"] = ret;
  return this;
};

/**
 * Specifies whether to return cts:similar documents to those in the search results
 * 
 * @param {boolean} ret - Whether to return cts:similar documents for each search match.
 */
mldb.prototype.options.prototype.returnSimilar = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-similar"] = ret;
  return this;
};

/**
 * Specifies whether to return values objects
 * 
 * @param {boolean} ret - Whether to return values (co-occurence) matches with the response.
 */
mldb.prototype.options.prototype.returnValues = function(ret) {
  if (undefined == ret) {
    ret = true;
  }
  this.options["return-values"] = ret;
  return this;
};

/**
 * Specifies the default collation applies to all string constraints and sorts, if not specified on constraint definition
 * 
 * @param {string} col - The default collation URL spec to use
 */
mldb.prototype.options.prototype.defaultCollation = function(col) {
  this.defaults.collation = col;
  return this;
};

/**
 * Specifies the default sort order
 * 
 * @param {string} sort - The default sort order. 'ascending' (default) or 'descending'.
 */
mldb.prototype.options.prototype.defaultSortOrder = function(sort) {
  this.defaults.sortDirection = sort;
  return this;
};

/**
 * Specifies the default constraint type
 * 
 * @param {string} type - Sets the default type (default is xs:string)
 */
mldb.prototype.options.prototype.defaultType = function(type) {
  this.defaults.type = type;
  return this;
};

/**
 * Specifies the default element namespace to use
 * 
 * @param {string} ns - Sets the default namespace value
 */
mldb.prototype.options.prototype.defaultNamespace = function(ns) {
  this.defaults.namespace = ns;
  return this;
};

/**
 * Generates a new Xpath constraint - TODO
 */
mldb.prototype.options.prototype.pathConstraint = function() {
  // TODO path range constraint
};
mldb.prototype.options.prototype.path = mldb.prototype.options.prototype.pathConstraint;


/**
 * Creates a new element attribute range constraint, and adds it to the search options object
 * 
 * @param {string} constraint_name - Constraint name to use.
 * @param {string} elment - Element name to use
 * @param {string} namespace - Namespace to use.
 * @param {string} attr - Element attribute to use
 * @param {string} type_opt - XML Schema type. E.g. "xs:string". Optional. If not specified, default type is used.
 * @param {string} collation_opt - The optional string collation to used. If not specified, default collation is used (if of xs:string type)
 * @param {JSON} facet_opt - The optional facet JSON to use.
 * @param {JSON} facet_options_opt - The optional facet configuration JSON to use.
 */
mldb.prototype.options.prototype.elemattrRangeConstraint = function(constraint_name,element,namespace,attr,type_opt,collation_opt,facet_opt,facet_options_opt) {
  var range = {name: constraint_name,
    range: {
      type: type_opt || this.defaults.type, 
      element: {
        name: element, ns : namespace || this.defaults.namespace
      },
      attribute: {
        name: attr,
        ns: namespace || this.defaults.namespace
      },
      collation: collation_opt || this.defaults.collation
    }
  };
  if (undefined != facet_opt || undefined != facet_options_opt) {
    range.range.facet = true;
  }
  if (undefined != facet_options_opt) {
    range.range["facet-options"] = facet_options_opt;
  }
  
  // Create sort orders automatically
  this.sortOrder(this.defaultSortDirection,type_opt || this.defaults.type,element,collation_opt || this.defaults.collation); // TODO verify this works with normal XML range indexes not json keys
  
  this.addConstraint(range);
  
  return this;
};

/**
 * Specifies a new range constraint, and adds it to the search options object
 * 
 * @param {string} constraint_name_opt - Optional constraint name to use. Defaults to NULL
 * @param {string} name_or_key - Element name or JSON key to use
 * @param {string} ns_opt - Namespace to use. Optional. If not specified, default namespace is used. (If type is XML element)
 * @param {string} type_opt - Whether to use 'json' (default) or 'xml' element matching
 * @param {string} collation_opt - The optional string collation to used. If not specified, default collation is used
 * @param {JSON} facet_opt - The optional facet JSON to use.
 * @param {JSON} facet_options_opt - The optional facet configuration JSON to use.
 */
mldb.prototype.options.prototype.rangeConstraint = function(constraint_name_opt,name_or_key,ns_opt,type_opt,collation_opt,facet_opt,facet_options_opt) {
  this._includeSearchDefaults();
  if (undefined == facet_options_opt) {
    if (undefined != facet_opt && Array.isArray(facet_opt)) {
      facet_options_opt = facet_opt;
      facet_opt = true;
    } else if (undefined != collation_opt && Array.isArray(collation_opt)) {
      facet_options_opt = collation_opt;
      collation_opt = undefined;
      facet_opt = true;
    } else if (undefined != typeof type_opt && Array.isArray(type_opt)) {
      facet_options_opt = type_opt;
      type_opt = undefined;
      facet_opt = true;
    } else if (undefined != typeof ns_opt && Array.isArray(ns_opt)) {
      facet_options_opt = ns_opt;
      ns_opt = undefined;
      facet_opt = true;
    }
  }
  if (undefined == facet_opt) {
    if (undefined != collation_opt && "boolean" === typeof collation_opt) {
      facet_opt = collation_opt;
      collation_opt = undefined;
    } else if (undefined !=  type_opt && "boolean" === typeof type_opt) {
      facet_opt = type_opt;
      type_opt = undefined;
    } else if (undefined !=  ns_opt && "boolean" === typeof ns_opt) {
      facet_opt = ns_opt;
      ns_opt = undefined;
    }
  }
  if (undefined ==  collation_opt) {
    if (undefined !=  type_opt && "string" === typeof type_opt && (type_opt.length < 4 || "xs:" != type_opt.substring(0,3))) {
      collation_opt = type_opt;
      type_opt = undefined;
    } else if (undefined !=  ns_opt && "string" === typeof ns_opt && (ns_opt.length < 4 || "xs:" != ns_opt.substring(0,3))) {
      collation_opt = ns_opt;
      ns_opt = undefined;
    } 
  }
  if (undefined ==  type_opt) {
    if (undefined !=  ns_opt && "string" === typeof ns_opt && (ns_opt.length > 4 && "xs:" == ns_opt.substring(0,3))) {
      type_opt = ns_opt;
      ns_opt = undefined;
    }
  }
  if ("string" == typeof constraint_name_opt && Array.isArray(name_or_key)) {
    facet_opt = name_or_key;
    name_or_key = constraint_name_opt;
  }
  if (undefined == name_or_key) {
    if (undefined !=  constraint_name_opt) {
      name_or_key = constraint_name_opt; // keep contraint name same as name or key (dont set to undefined)
    }
  }
  if (undefined == constraint_name_opt) {
    constraint_name_opt = name_or_key;  
  }
  // output values here
  mldb.defaultconnection.logger.debug("rangeConstraint(): cName: " + constraint_name_opt + 
    ", name_or_key: " + name_or_key + ", ns_opt: " + ns_opt + ", type_opt: " + type_opt + ", collation_opt: " + collation_opt +
    ", facet_opt: " + facet_opt + ", facet_options_opt: " + facet_options_opt);
  // now use values
  var range = {name: constraint_name_opt,
    range: {
      type: type_opt || this.defaults.type, 
      element: {
        name: name_or_key, ns : ns_opt || this.defaults.namespace
      },
      collation: collation_opt || this.defaults.collation
    }
  };
  if (undefined != facet_opt || undefined != facet_options_opt) {
    range.range.facet = true;
  }
  if (undefined != facet_options_opt) {
    range.range["facet-options"] = facet_options_opt;
  }
  
  // Create sort orders automatically
  this.sortOrder(this.defaultSortDirection,type_opt || this.defaults.type,name_or_key,collation_opt || this.defaults.collation); // TODO verify this works with normal XML range indexes not json keys
  
  this.addConstraint(range);
  
  return this;
};
mldb.prototype.options.prototype.range = mldb.prototype.options.prototype.rangeConstraint;

/**
 * <p>Adds any new constraint JSON to the search options object. Always called by the *Constraint methods themselves anyway. </p><p>
 * This is for any constraints you wish to add that don't have their own method here.
 * </p>
 * @param {JSON} con - Constraint JSON to add to these options.
 */
mldb.prototype.options.prototype.addConstraint = function(con) {
  this.options.constraint.push(con);
};

/**
 * Create a collection constraint, and adds it to the search options object
 * 
 * @param {string} constraint_name_opt - Optional constraint name to use. Defaults to 'collection'
 * @param {string} prefix - Optional prefix (base collection) to use. Defaults to blank ''. I.e. all collections
 * @param {JSON} facet_option_opt - Optional JSON facet configureation. If not configured, will use the default facet configuration
 */
mldb.prototype.options.prototype.collectionConstraint = function(constraint_name_opt,prefix_opt,facet_option_opt) {
  this._includeSearchDefaults();
  var con = { name: constraint_name_opt || "collection", collection: {}};
  if (undefined != prefix_opt && null != prefix_opt) {
    con.collection.prefix = prefix_opt;
  } else {
    con.collection.prefix = "";
  }
  if (undefined != facet_option_opt && null != facet_option_opt) {
    con.collection["facet-option"] = facet_option_opt;
  } else if (undefined != this.defaults.facetOption) {
    con.collection["facet-option"] = this.defaults.facetOption;
  }
  this.addConstraint(con);
  return this;
};
mldb.prototype.options.prototype.collection = mldb.prototype.options.prototype.collectionConstraint;

/**
 * Create a geospatial element pair constraint, and adds it to the search options object
 * 
 * @param {string} constraint_name - Name of the constraint to create
 * @param {string} parent - Parent element name
 * @param {string} ns_opt - Optional namespace of the parent element. If not provided, uses the default namespace
 * @param {string} element - Element name of the geospatial pair element
 * @param {string} ns_el_opt - Optional namespace of the child geospatial element. If not configured will use the default namespace
 */
mldb.prototype.options.prototype.geoelemConstraint = function(constraint_name_opt,parent,ns_opt,element,ns_el_opt) {
  if (undefined == element) {
    if (undefined == ns_opt) {
      element = parent;
      parent = constraint_name_opt;
      constraint_name_opt = undefined;
    } else {
      element = ns_opt;
      ns_opt = parent;
      parent = constraint_name_opt;
      constraint_name_opt = undefined;
    }
  }
  if (undefined == parent) {
    constraint_name_opt = parent;
    parent = ns_opt;
    ns_opt = undefined;
  }
  if (undefined == constraint_name_opt) {
    constraint_name_opt = element;
  }
  var con = { name: constraint_name_opt, "geo-elem": {
    parent: {ns: ns_opt || this.defaults.namespace, name: parent, element: {ns: ns_el_opt || this.defaults.namespace, name: element}}
  }};
  this.addConstraint(con);
  return this;
};
mldb.prototype.options.prototype.geoelem = mldb.prototype.options.prototype.geoelemConstraint;

/**
 * Specifies a geospatial element attribute pair constraint, and adds it to the search options object
 */
mldb.prototype.options.prototype.geoelemattrConstraint = function() {
  // TODO geoelem attr
};
mldb.prototype.options.prototype.geoelemattr = mldb.prototype.options.prototype.geoelemattrConstraint;

/**
 * Specifies a geospatial element pair constraint, and adds it to the search options object
 */
mldb.prototype.options.prototype.geoelempairConstraint = function() {
  // TODO geoelem pair
};
mldb.prototype.options.prototype.geoelempair = mldb.prototype.options.prototype.geoelempairConstraint;

/**
 * Specifies the number of search results to return on each page
 * 
 * @param {positiveInteger} length - Page length to use. If not specified, uses the default (10).
 */
mldb.prototype.options.prototype.pageLength = function(length) {
  this._includeSearchDefaults();
  this.options["page-length"] = length;
  return this;
};

/**
 * Specifies the results transformation options. Defaults to raw (full document returned).
 * 
 * @param {string} apply - The XQuery function name
 * @param {string} ns_opt - The optional XQuery namespace of the module to invoke
 * @param {string} at_opt - The relative location in the REST modules database to find the transform to invoke
 */
mldb.prototype.options.prototype.transformResults = function(apply,ns_opt,at_opt) {
  this._includeSearchDefaults();
  //this.options["search-option"] = true;
  this.options["transform-results"].apply = apply;
  if (undefined != ns_opt && undefined != at_opt) {
    this.options["transform-results"].ns = ns_opt;
    this.options["transform-results"].at = at_opt;
  }
  return this;
};

/**
 * Clears any default or specified sort order definitions
 */
mldb.prototype.options.prototype.sortOrderClear = function() {
  this._includeSearchDefaults();
  this.options["sort-order"] = new Array();
  return this;
};

/**
 * Specifies score as the sort order
 */
mldb.prototype.options.prototype.sortOrderScore = function() {
  this._includeSearchDefaults();
  // TODO add check to see if we already exist
  this.options["sort-order"].push({"direction": "descending","score": null});
  return this;
};

/**
 * Specifies the sort order. Automatically called for any of the range constraint constructor functions.
 * 
 * @param {string} direction_opt - The direction (ascending or descending) to use. If not specified, uses the default direction.
 * @param {string} type_opt - The type of the sort element. If not specified uses the default type.
 * @param {string} key - The key (JSON key or element name) to use.
 * @param {string} collation_opt - The optional collation to use. Uses the default collation if not specified.
 */
mldb.prototype.options.prototype.sortOrder = function(direction_opt,type_opt,key,collation_opt) {
  this._includeSearchDefaults();
  // TODO check for unspecified type, direction, collation (and element + ns instead of key)
  var so = {direction: direction_opt || this.defaults.sortDirection,type:type_opt || this.defaults.type,"json-key": key};
  if ("xs:string" == collation_opt) {
    so.collation = collation_opt || this.defaults.collation;
  }
  this.options["sort-order"].push(so);
  return this;
};
/*
    "options": {
      "tuples": [
        {
          "name": agName,
          "range": [
            {
              "type": "xs:string",
              "element": {
                "ns": "http://marklogic.com/xdmp/json/basic",
                "name": "actor"
              }
            },
            {
              "type": "xs:string",
              "element": {
                "ns": "http://marklogic.com/xdmp/json/basic",
                "name": "genre"
              }
            }
          ]
        }
      ]
    }
    */

mldb.prototype.options.prototype._quickRange = function(el) {
  if (typeof el == "string") {
    return {type: this.defaults.type, element: {ns: this.defaults.namespace, name: el}};
  } else {
    // json range object
    return el;
  }
};

/**
 * Creates a tuples definition for returning co-occurence values
 * 
 * @param {string} name - The name of the tuples configuration to create
 * @param {string|JSON} el - The first element for a co-occurence. Either an element/json key name (string) or a full REST API range type object (JSON)
 * @param {string|JSON} el - The second element for a co-occurence. Either an element/json key name (string) or a full REST API range type object (JSON)
 */
mldb.prototype.options.prototype.tuples = function(name,el,el2) { // TODO handle infinite tuple definitions (think /v1/ only does 2 at the moment anyway)
  var tuples = {name: name,range: new Array()};
  if (undefined == this.options.tuples) {
    this.options.tuples = new Array();
  }
  tuples.range.push(this._quickRange(el));
  tuples.range.push(this._quickRange(el2));
  this.options.tuples.push(tuples);
  return this;
};

/**
 * Creates a values definition for returning lexicon values
 * 
 * @param {string} name - The name of the values configuration to create
 * @param {string|JSON} el - The first element for a co-occurence. Either an element/json key name (string) or a full REST API range type object (JSON)
 * @param {string|JSON} el - The second element for a co-occurence. Either an element/json key name (string) or a full REST API range type object (JSON)
 */
mldb.prototype.options.prototype.values = function(name,el,el2) {
  var values = {name: name,range: new Array()};
  if (undefined == this.options.values) {
    this.options.values = new Array();
  }
  values.range.push(this._quickRange(el));
  values.range.push(this._quickRange(el2));
  this.options.values.push(values);
  return this;
};


/*
mldb.prototype.options = function() {
  return new mldb.prototype.options();
};
*/











// Structured Query Builder object

/**
 * Creates a structured query builder object
 * @constructor
 */
mldb.prototype.query = function() {
  this._query = {
    // TODO initialise query object
  };
  
  this.defaults = {};
  // TODO set defaults
};

/**
 * Returns the JSON object used in the REST API (and MLDB functions) that this query builder represents
 */
mldb.prototype.query.prototype.toJson = function() {
  return {query: this._query};
};

// TOP LEVEL QUERY CONFIGURATION (returning this)

/**
 * Copies an existing query options object in to this object (pass a JSON structure query, not an mldb.query object)
 * 
 * @param {JSON} query_opt - The query to copy child values of to this query
 */
mldb.prototype.query.prototype.query = function(query_opt) {
  for (var name in query_opt) {
    // copy {collection: ...} collection (or and-query, or-query) in to our query object - should work with any valid query type
    this._query[name] = query_opt[name];
  }
  return this;
};

// QUERY CREATION FUNCTIONS (returns query JSON)

/**
 * Creates an and query, and returns it
 * 
 * @param {JSON} query - The query, or array of queries, to use within the constructed and query
 */
mldb.prototype.query.prototype.and = function(query_opt) {
  if (Array.isArray(query_opt)) {
    return { "and-query": query_opt};
  } else {
    // object
    return { "and-query": [query_opt]};
  }
};


/**
 * Creates an or query, and returns it
 * 
 * @param {JSON} query - The query, or array of queries, to use within the constructed or query
 */
mldb.prototype.query.prototype.or = function(query_opt) {
  if (Array.isArray(query_opt)) {
    return { "or-query": query_opt};
  } else {
    // object
    return { "or-query": [query_opt]};
  }
};

/**
 * Creates a collection query, and returns it
 * 
 * @param {string} uri_opt - The optional URI to use as the base. If not specified a blank '' value is used (i.e. all collections returned to the specified depth)
 * @param {integer} depth_opt - What depth in the child collections to include (defaults to infinite if not specified)
 */
mldb.prototype.query.prototype.collection = function(uri_opt,depth_opt) {
  if (undefined == uri_opt) {
    return {"collection-query": {uri: ""}}; // all collections by default
  } else if ("string" == typeof uri_opt) {
    // single uri
    return {"collection-query": {uri: uri_opt}}
  } else if (Array.isArray(uri_opt)) {
    // TODO handle array of uris
  } else {
    mldb.defaultconnection.logger.debug("WARNING: query.collection(): uri_opt not an array or string, but instead a '" + (typeof uri_opt) + "'");
  }
  return undefined;
};

// TODO geo example
/*
                        query: {
                          "and-query": {
                            
                            "range-constraint-query": {
                              "constraint-name": "type",
                              "value": ["maptile"]
                            },
                            
                            "range-constraint-query": {
                              "constraint-name": "layer",
                              "value": ["os"]
                            },
                            
                            "geospatial-constraint-query": {
                              "constraint-name": "centre",
                              "circle": {
                                "radius": json.radiusmiles,
                                "point":[{"latitude":json.lat,"longitude":json.lon}]
                              }
                            }
                          }
                        }
*/
/**
 * Creates a geospatial circle query and returns it
 * 
 * @param {string} constraint_name - Name of the matching constraint to restrict by these values
 * @param {integer} lat - WGS84 latitude
 * @param {integer} lon - WGS84 Longitude
 * @param {positiveInteger} radiusmiles - The radius from the circle centre to use. Defaults to statute (not nautical) miles
 * @param {string} radiusmeasure_opt - The units used. Default is status miles. m=metres, km=kilometres, nm=nautical miles, degrees=degrees of rotation of the Earth
 */
mldb.prototype.query.prototype.georadius = function(constraint_name,lat,lon,radiusmiles,radiusmeasure_opt) {
  var radiusactual = radiusmiles;
  if (undefined != radiusmeasure_opt) {
    if ("km" == radiusmeasure_opt) {
    } else if ("m" == radiusmeasure_opt) {
    } else if ("nm" == radiusmeasure_opt) {
      // TODO conversion helper
    } else if ("degrees" == radiusmeasure_opt) {
      // degrees of rotation - 1 minute (1/60 of a degree) is 1 nm
    }
  }
  return {
    "geospatial-constraint-query" : {
      "constraint-name": constraint_name,
      "circle": {
        "radius": radiusactual,
        point: [{"latitude": lat,"longitude": lon}]
      }
    }
  }
};

/**
 * Creates a range constraint query and returns it
 * 
 * @param {string} constraint_name - The constraint name from the search options for this constraint
 * @param {string} val - The value that matching documents must match
 */
mldb.prototype.query.prototype.range = function(constraint_name,val) {
  return {
    
            "range-constraint-query": {
              "value": val,
              "constraint-name": constraint_name
            }
  }
};

mldb.prototype.query.prototype.uris = function(constraint_name,uris) {
  return {
    "document-query": {
      "uri": uris
    }
  }
};

// TODO bounding box query

// TODO within polygon query

/*
mldb.prototype.query = function() {
  return new mldb.prototype.query();
};*/