// global variable definitions
com = window.com || {};
com.marklogic = window.com.marklogic || {};
com.marklogic.widgets = window.com.marklogic.widgets || {};

/**
 * Provides a form builder widget to allow the creation of a document. Also includes file update widget and security widgets.
 * @constructor
 * @param {string} container - The HTML ID of the element to place this widget's content within.
 */
com.marklogic.widgets.create = function(container) {
  this.container = container;
  
  this.vertical = true; // vertical or horizontal first rendering
  
  this._collections = new Array();
  this._permissions = new Array(); // ?
  
  this.currentRow = 0;
  this.currentColumn = 0;
  
  this.completePublisher = new com.marklogic.events.Publisher();
  
  this.controlCount = 0;
  this.fileDrops = new Array();
  this.fileDropFiles = new Array();
  
  this.override = false;
  this.overrideEndManual = false;
  this.overrideElementId = "";
  
  
  this._uriprefix = "/";
  
  this.controls = new Array();
  this.controlData = new Array();
  
  this._mode = "upload"; // upload or json or xml
  
  this._init();
};

com.marklogic.widgets.create.prototype._init = function() {
  var parentel = document.getElementById(this.container);
  parentel.innerHTML = 
    "<div id='" + this.container + "-create'>" +
      "<div class='create-title'>Create a new Document</div>" +
      "<form id='" + this.container + "-create-form' class='create-form'>" + 
        "<div class='create-row' id='" + this.container + "-create-row-0'>" +
          "<div class='create-col' id='" + this.container + "-create-row-0-col-0' style='float:left;'></div>" +
        "</div>" +
      "</form>"
    "</div><div style='";
};

// LAYOUT FUNCTIONS

com.marklogic.widgets.create.prototype._place = function(html,type,id) {
  if (this.override) {
    // override placement (allows containment within widget)
    document.getElementById(this.overrideElementId).innerHTML += html;
  } else {
    // place the html in the 'current' position, and increment
    var cid = this.container + "-create-row-" + this.currentRow + "-col-" + this.currentColumn;
    var cel = document.getElementById(cid);
    cel.innerHTML = html;
    if (this.vertical) {
      this.endRow();
    } else {
      // incrememnt column
      this.currentColumn++;
      // append column div to row element
      var h = "<div class='create-col' id='" + this.container + "-create-row-" + this.currentRow + "-col-" + this.currentColumn + "' style='float:left;'></div>";
      document.getElementById(this.container + "-create-row-" + this.currentRow).innerHTML += h;
    }
  }
  
  // add the control definition to our form references link - so save can process the form
  if (undefined != type && undefined != id) {
    this.controls.push({type: type,id: id});
  }
};

/**
 * Ends the current row run and starts a new row.
 */
com.marklogic.widgets.create.prototype.endRow = function() {
  // clear previous row
  document.getElementById(this.container + "-create-row-" + this.currentRow).innerHTML += "<div style='clear:both'></div>";
  
    // create new row
    this.currentRow++;
    // reset column counter
    this.currentColumn = 0;
    // append div to form element
    var h = 
        "<div class='create-row' id='" + this.container + "-create-row-" + this.currentRow + "'>" +
          "<div class='create-col' id='" + this.container + "-create-row-" + this.currentRow + "-col-" + this.currentColumn + "' style='float:left;'></div>" +
        "</div>";
    document.getElementById(this.container + "-create-form").innerHTML += h;
    
  return this;
};

// Configuration methods for create widget - MUST be called before control creation methods

/**
 * Specifies the creation mode for the widget. Can be "upload", "json" or "xml". If upload, the underlying browser's mime type support determines the type to send the document to MarkLogic as.
 * 
 * @param {string} newMode - The new mode to use
 */
com.marklogic.widgets.create.prototype.mode = function(newMode) {
  this._mode = newMode;
  
  return this;
};

/**
 * Specifies the URI prefix of the newly generated document.
 * 
 * @param {string} prefix - The document URI prefix to use.
 */
com.marklogic.widgets.create.prototype.uriprefix = function(prefix) {
  this._uriprefix = prefix;
  
  return this;
};

/**
 * Specifies that the next created 'cell' should be to the right of the current one. Difference between a table layout and a vertical div layout.
 * Vertical is the default.
 */
com.marklogic.widgets.create.prototype.horizontal = function() {
  // draw new controls horizontally, not vertically
  this.vertical = false;
  
  return this;
};

/**
 * Specifies that the resultant document should also be added to a collection with the name 'user-USERID'.
 * TODO will call mldb's whoami extension to determine username, if not already known.
 */
com.marklogic.widgets.create.prototype.collectionUser = function() {
  // add user- and this user's id to the collection list
  
  return this;
};

/**
 * Adds the resultant document(s) to the specified collection. May be called multiple times if multiple collections are required.
 * 
 * @param {string} col - Collection name to add the new document(s) to.
 */
com.marklogic.widgets.create.prototype.collection = function(col) {
  this._collections.push(col);
  
  return this;
};

// FORM CONTROLS

/**
 * Places a drag and drop upload control within the current cell, and creates a new cell.
 */
com.marklogic.widgets.create.prototype.dnd = function() {
  // check for browser support
  if (window.File && window.FileReader && window.FileList && window.Blob) {
    // Great success! All the File APIs are supported.
    console.log("File API is supported by this browser");
  } else {
    console.log('The File APIs are not fully supported in this browser.');
  }
  
  // create a drag and drop widget
  var id = this.container + "-dnd-" + ++this.controlCount;
  /*
  var html = "<div id='" + id + "' class='create-dnd'></div>";
  
  this._place(html,"dnd",id);
  
  var fd = new FileDrop(id,{dragOverClass: "create-dnd-hover"});
  this.fileDrops[id] = fd;
  this.fileDropFiles[id] = new Array();
  
  var self = this;
  fd.on.send = function (files) {
    // store file objects until user clicks save
    for (var f = 0;f < files.length;f++) {
      self.fileDropFiles[id].push(files[f]);
    }
  };
  
  this.controlData[id] = {filedrop: fd};
  */
  
  var html = "<input type='file' id='" + id + "'/>";
  this._place(html,"dnd",id);
  
  var self = this;
  document.getElementById(id).onchange = function(evt) {
    console.log("file onchange fired");
    self.controlData[id] = {files: evt.target.files};
    console.log("Saved file data");
  };
  
  return this;
};

/**
 * Ensures that the resultant document has the specified permission object applied, in addition to those from any embedded permissions widgets.
 * 
 * @param {JSON} permObject - The permission specification to use. E.g. {role: "topsecret", permission: "read"}
 */
com.marklogic.widgets.create.prototype.forcePermission = function(permObject) {
  this._permissions.push(permObject);
  
  return this;
};

/**
 * Adds a permissions drop down widget to the current cell, and creates a new cell.
 * 
 * @param {boolean} allowMultiple - Whether to allow multiple roles to be selected. NOT SUPPORTED (i.e. always false)
 * @param {string[]} firstRoleArray - The lists of roles to allow selection of. Lowest access first. Normally all are in the same security compartment.
 * @param {string} title_opt - The optional title text to show next to the control. E.g. 'Role for Read'
 * @param {string} privilege - The privliege to grant to the selected role. E.g. read, update, delete
 */
com.marklogic.widgets.create.prototype.permissions = function(allowMultiple,firstRoleArray,title_opt,privilege) {
  if (undefined == privilege) {
    privilege = title_opt;
    title_opt = undefined;
  }
  
  // add permissions control
  var id = this.container + "-permissions-" + (++this.controlCount);
  var html = "<div id='" + id + "' class='create-permissions'>";
  if (undefined != title_opt) {
    html += "<label for='" + id + "'>" + title_opt + "</label> ";
  }
  html += "<select id='" + id + "-select'>";
    
  for (var i = 0;i < firstRoleArray.length;i++) {
    html += "<option value='" + firstRoleArray[i] + "'>" + firstRoleArray[i] + "</option>";
  }
  
  html += "</select></div>";
  
  this._place(html,"permissions",id);
  this.controlData[id] = {privilege:privilege};
  return this;
};

/**
 * Generates a button bar as a full row below the current row.
 */
com.marklogic.widgets.create.prototype.bar = function() {
  var id = this.container + "-bar-" + ++this.controlCount;
  var html = "<div id='" + id + "' class='create-bar'></div>";
  this._place(html,"bar",id);
  
  // override placement strategy
  this.override = true;
  this.overrideElementId = id;
  this.overrideEndManual = true;
  
  return this;
};

/**
 * Ends the current bar, and adds any subsequent content to a new row.
 */
com.marklogic.widgets.create.prototype.endBar = function() {
  this.override = false;
  this.overrideEndManual = false;
  this.overrideElementId = "";
  
  //this._place("");
  
  return this;
};

/**
 * Generates a save button control at the current position.
 * 
 * @param {string} title_opt - Optional string title to show on the button. (Defaults to 'Save')
 */
com.marklogic.widgets.create.prototype.save = function(title_opt) {
  var id = this.container + "-create-save-" + ++this.controlCount;
  var title = "Save";
  if (undefined != title_opt) {
    title = title_opt;
  }
  
  var html = "<input class='create-save' type='submit' id='" + id + "' value='" + title + "' />";
  this._place(html,"save",id);
  
  var self = this;
  //document.getElementById(id).onclick = function(e) {console.log("got onclick");self._onSave(self);console.log("done onsave");e.stopPropagation();console.log("done stop prop");return false;}; // TODO Check this is valid
  document.getElementById(this.container + "-create-form").onsubmit = function() {
    try {
      self._onSave();
    } catch (ex) {
      console.log("ERROR ON SAVE: " + ex);
    }
    return false;
  };
  // TODO find a way to do this without working at the form level
  
  return this;
};

// EVENT HANDLERS


/**
 * Adds a function as a listener to be called when this widget successfully generates a new document, passing in the new document's URI. If multiple documents are created, passes an array of string uris.
 * 
 * @param {function} lis - The listener function to add. Function should accept a string uri
 */
com.marklogic.widgets.create.prototype.addCompleteListener = function(lis) {
  this.completePublisher.subscribe(lis);
};

/**
 * Removes a completion listener from this widget.
 * 
 * @param {function} lis - The listener function to remove. Function should accept a string uri
 */
com.marklogic.widgets.create.prototype.removeCompleteListener = function(lis) {
  this.completePublisher.unsubscribe(lis);
};

com.marklogic.widgets.create.prototype._onSave = function() {
  console.log("onSave called");
  // loop through controls
  // create uploaded or new json/xml document with those fields
  // save document with specified uri or uri prefix, collection(s), permissions
  if ("upload" == this._mode) {
    // find file upload control and get document
    var uploadCtl = null;
    var perms = new Array();
    for (var i = 0;i < this.controls.length;i++) {
      var ctl = this.controls[i];
      console.log("control: " + JSON.stringify(ctl));
      if ("dnd" == ctl.type) {
        uploadCtl = ctl;
      }
      // TODO extract other properties about this document
      if ("permissions" == ctl.type) {
        var ctlData = this.controlData[ctl.id];
        var e = document.getElementById(ctl.id + "-select");
        //console.log("selected value: " + e.value);
        //console.log("selected perm: " + e.selectedIndex);
        //console.log("selected perm value: " + e.options[e.selectedIndex]);
        //var str = e.options[e.selectedIndex].text;
        //console.log("adding permission: " + e.value + " = read");
        perms.push({role: e.value, permission: ctlData.privilege});
        //perms.push({role: e.value + "-write", permission: "insert"});
        //perms.push({role: e.value + "-write", permission: "update"});
        //perms.push({role: "can-read", permission: "read"});
      }
    }
    
    // add forced permissions
    for (var p = 0;p < this._permissions.length;p++) {
      perms.push(this._permissions[p]);
    }
    
    if (null != uploadCtl) {
      console.log("got uploadCtl");
      
      
      /*
      // get file info for upload
      var reader = new FileReader();
      //var files = this.controlData[uploadCtl.id].files;
      //var file = files[0]; // TODO handle multiple, none
      console.log("fetching file")
      var fileel = document.getElementById(uploadCtl.id);
      var file = fileel.files[0];
      console.log("reading file");
      
      var self = this;
      
      reader.onload = (function(theFile) {
      
      var bin = reader.readAsArrayBuffer(theFile);
      console.log("BIN RESULT: " + bin);
      console.log("Reader info: " + JSON.stringify(reader));
      
        return function(e) {
          var res = e.target.result; // WRONG - THIS IS SENDING BYTE LENGTH ONLY
          console.log("TARGET JSON: " + JSON.stringify(e));
          //
          for (var n in fileel) {
            console.log(" " + n);
            console.log("  " + n + ": " + typeof(fileel[n]));
          }//
          console.log("result: " + JSON.stringify(res));
          var cols = "";
          for (var i = 0;i < self._collections.length;i++) {
            if (0 != i) {
              cols += ",";
            }
            cols += self._collections[i];
          }
          // send as octet stream, filename for after URI prefix
          console.log("calling mldb save");
          var props = {
            contentType: file.type,
            collection: cols,
            permissions: perms
          }
          console.log("mime type: " + file.type);
          console.log("Request properties: " + JSON.stringify(props));
          mldb.defaultconnection.save(res,self._uriprefix + file.name,props,function(result) {
            if (result.inError) {
              console.log("ERROR: " + result.doc);
            } else {
              console.log("SUCCESS: " + result.docuri);
              self.completePublisher.publish(result.docuri);
            }
          });
        }
      })(file);
      
      */
      
      
      
      
      
    var files = document.getElementById(uploadCtl.id).files;
    if (!files.length) {
      alert('Please select a file!');
      return;
    }

    var file = files[0];
    var start = 0;
    var stop = file.size - 1;

    
          var cols = "";
          for (var i = 0;i < this._collections.length;i++) {
            if (0 != i) {
              cols += ",";
            }
            cols += this._collections[i];
          }
          
          var props = {
            contentType: file.type,
            //contentType: false,
            format: "binary",
            collection: cols,
            permissions: perms
          }
          console.log("mime type: " + file.type);
          console.log("Request properties: " + JSON.stringify(props));
          
    var reader = new FileReader();
    var self = this;

    // If we use onloadend, we need to check the readyState.
    reader.onloadend = function(evt) {
      if (evt.target.readyState == FileReader.DONE) { // DONE == 2
        //document.getElementById('byte_content').textContent = evt.target.result;
        
        console.log("file content: " + evt.target.result);
        
        // save to ML
        
        console.log("calling mldb save");
          /*
          var arrBuff = new ArrayBuffer(evt.target.result.length);
          var writer = new Uint8Array(arrBuff);
          for (var i = 0, len = evt.target.result.length; i < len; i++) {
              writer[i] = evt.target.result.charCodeAt(i);
          }*/
          
          mldb.defaultconnection.save(file,self._uriprefix + file.name,props,function(result) {
            if (result.inError) {
              console.log("ERROR: " + result.doc);
            } else {
              console.log("SUCCESS: " + result.docuri);
              self.completePublisher.publish(result.docuri);
            }
          });
        
        
        
        
        /*document.getElementById('byte_range').textContent = 
            ['Read bytes: ', start + 1, ' - ', stop + 1,
             ' of ', file.size, ' byte file'].join('');*/
      }
    };

    var blob = null;
    if (file.webkitSlice) {
      blob = file.webkitSlice(start, stop + 1);
    } else if (file.mozSlice) {
      blob = file.mozSlice(start, stop + 1);
    }
    //reader.readAsBinaryString(blob);
    reader.readAsArrayBuffer(blob);
    //reader.readAsText(file);
      
    } else {
      // TODO
      console.log("upload ctl null");
    }
  } else {
    // TODO
    console.log("unknown mode: " + this._mode);
  }
};