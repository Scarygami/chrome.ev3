/*
 * Copyright (c) 2013 Gerwin Sturm, FoldedSoft e.U. / www.foldedsoft.at
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

(function (global) {
  "use strict";

  var
    con = global.console,
    doc = global.document,
    hapi;

  hapi = global.gapi.hangout;

  function EV3() {
    con.log("App started...");
    this.connected = false;
    this.extension = false;
  }

  EV3.prototype.initialize = function () {
    this.connectButton = doc.getElementById("connect");
    this.connectButton.onclick = this.connect.bind(this);
    this.connectButton.disabled = true;

    this.controls = doc.getElementById("controls");
    this.statusElement = doc.getElementById("status");

    doc.getElementById("forward").onclick = this.move.bind(this, "forward");
    doc.getElementById("right").onclick = this.move.bind(this, "right");
    doc.getElementById("back").onclick = this.move.bind(this, "back");
    doc.getElementById("left").onclick = this.move.bind(this, "left");

    global.addEventListener("message", this.onMessage.bind(this), false);

    this.sendExtensionMessage({"command": "checkExtension"});
  };

  EV3.prototype.connect = function () {
    this.sendExtensionMessage({"command": "connect"});
  };

  EV3.prototype.move = function (direction) {
    this.sendExtensionMessage({"command": "move", "direction": direction});
  };

  EV3.prototype.sendExtensionMessage = function (message) {
    message.type = "FROM_HANGOUT";
    global.postMessage(message, global.location.origin);
  };

  EV3.prototype.onMessage = function (event) {
    // We only accept messages from ourselves
    if (event.source !== global) { return; }

    // We only accept messages coming from the Extension/Contentscript
    if (!event.data.type || event.data.type !== "FROM_EXTENSION") { return; }

    if (!!event.data.status) {
      this.statusElement.textContent = event.data.status;
    }
    if (!!event.data.checkExtension) {
      if (!this.connected) {
        this.extension = true;
        this.connectButton.disabled = false;
      }
    }
    if (!!event.data.connected) {
      this.connectButton.disabled = true;
      this.controls.style.display = "block";
    }
    if (!!event.data.disconnected) {
      this.connectButton.disabled = false;
      this.controls.style.display = "none";
    }
  };

  hapi.onApiReady.add(function (event) {
    if (event.isApiReady) {
      con.log("Hangout API Ready...");
      global.ev3 = new EV3();
      global.ev3.initialize();
    }
  });

}(this));