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
    bt = global.chrome.bluetooth,
    con = global.console,
    UUID = "00001101-0000-1000-8000-00805f9b34fb";

  function EV3() {
    var
      that = this,
      profile = {"uuid": UUID},
      current_device,
      devices = [],
      bt_available = false,
      api_ready = false,
      current_socket,
      readyCallbacks = [],
      COMMAND_TYPE = {
        "DirectReply": 0x00,
        "DirectNoReply": 0x80,
        "SystemReply": 0x01,
        "SystemNoReply": 0x81
      },
      OP_CODE = {
        "OutputStop": 0xA3,
        "OutputPower": 0xA4,
        "OutputSpeed": 0xA5,
        "OutputStart": 0xA6,
        "OutputPolarity": 0xA7,
        "OutputStepPower": 0xAC,
        "OutputTimePower": 0xAD,
        "OutputStepSpeed": 0xAE,
        "OutputTimeSpeed": 0xAF,
        "OutputStepSync": 0xB0,
        "OutputTimeSync": 0xB1  
      },
      OUTPUT_PORT = {
        "A": 0x01,
        "B": 0x02,
        "C": 0x04,
        "D": 0x08,
        "All": 0x0F
      },
      PARAMETER_SIZE = {
        "Byte": 0x81,   // 1 byte
        "Short": 0x82,  // 2 bytes
        "Int": 0x83,    // 4 bytes
        "String": 0x84  // null-terminated string
      };

    function onDeviceDiscovered(device) {
      if (device.paired && device.name.indexOf("EV3") === 0) {
        con.log("EV3 found", device);
        devices.push(device);
      }
    }

    function updateDevices(callback) {
      devices = [];
      if (!bt_available) {
        con.log("Bluetooth not available");
        try { callback(null, "Bluetooth not available"); } catch (e) {
          con.log("Error calling updateDevices callback", e);
        }
      }
      bt.getDevices({
        "deviceCallback": onDeviceDiscovered
      }, function () {
        var error = global.chrome.runtime.lastError;
        if (!!error) {
          con.log("Error updating devices", error);
          if (!!callback) {
            try { callback(null, error.message); } catch (e) {
              con.log("Error calling updateDevices callback", e);
            }
          }
        } else {
          con.log("Devices retrieved");
          if (!!callback) {
            try { callback(devices); } catch (e) {
              con.log("Error calling updateDevices callback", e);
            }
          }
        }
      });
    }

    function onAdapterStateChanged(state) {
      con.log("onAdapterStateChanged", state);
      if (!state || !state.available || !state.powered) {
        bt_available = false;
        api_ready = false;
        devices = [];
        current_device = false;
        current_socket = false;
      } else {
        bt_available = true;
        bt.addProfile(profile, function () {
          updateDevices(function () {
            var callback;
            api_ready = true;
            while(readyCallbacks.length > 0) {
              callback = readyCallbacks.pop();
              try { callback(); } catch (e) {
                con.log("Error calling onReady callback", e);
              }
            }
          });
        });
      }
    }

    function rawwrite(data, callback) {
      var buffer, view, l;
      if (!current_device || !current_socket) {
        if (!!callback) {
          try { callback(); } catch (e) {
            con.log("Error calling connect callback", e);
          }
        }
        return;
      }
      l = data.length;
      buffer = new ArrayBuffer(2 + data.length);
      view = new Uint8Array(buffer);
      view[0] = l & 0xFF;
      view[1] = (l >> 8) & 0xFF;
      for (i = 0; i < data.length; i++) {
        view[2 + i] = data[i] & 0xFF;
      }

      bt.write({"socket": current_socket, "data": buffer}, function (r) {
        if (!!callback) {
          try { callback(); } catch (e) {
            con.log("Error calling connect callback", e);
          }
        }
      });      
    }

    function write(seq, commandType, globalSize, localSize, data, callback) {
      var command = [], i;
      
      command.push(seq & 0xFF);
      command.push((seq >> 8) & 0xFF);

      if (commandType === COMMAND_TYPE.DirectReply || commandType === COMMAND_TYPE.DirectNoReply) {
        // 2 bytes (llllllgg gggggggg)
        command.push(globalSize & 0xFF);
        command.push(((localSize << 2) | ((globalSize >> 8) & 0x03)) & 0xFF);
      }

      for (i = 0; i < data.length; i++) {
        command.push(data[i] & 0xFF);
      }

      rawwrite(command, callback);
    }

    function onConnection(socket) {
      con.log("onConnection", socket);
      current_socket = socket;
    }

    function connect(device_id, callback) {
      var device;
      if (!api_ready) {
        con.log("API not ready");
        if (!!callback) {
          try { callback("API not ready"); } catch (e) {
            con.log("Error calling connect callback", e);
          }
        }
        return;
      }
      if (devices.length === 0) {
        con.log("No devices available");
        if (!!callback) {
          try { callback("No devices available"); } catch (e) {
            con.log("Error calling connect callback", e);
          }
        }
        return;
      }
      device = devices[device_id];
      if (!device) {
        con.log("Device not found");
        if (!!callback) {
          try { callback("Device not found"); } catch (e) {
            con.log("Error calling connect callback", e);
          }
        }
        return;
      }
      bt.connect({
        "device": device,
        "profile": profile
      }, function () {
        var error = global.chrome.runtime.lastError;
        if (!!error) {
          con.log("Connection failed", error);
          if (!!callback) {
            try { callback(error.message); } catch (e) {
              con.log("Error calling connect callback", e);
            }
          }
        } else {
          con.log("EV3 connected");
          current_device = device;
          if (!!callback) {
            try { callback(); } catch (e) {
              con.log("Error calling connect callback", e);
            }
          }
        }
      });
    }
    
    function disconnect(callback) {
      if (!current_device || !current_socket) {
        con.log("No device connected");
        if (!!callback) {
          try { callback("No device connected"); } catch (e) {
            con.log("Error calling disconnect callback", e);
          }
        }
        return;
      }
      bt.disconnect({
        "socket": current_socket
      }, function () {
        var error = global.chrome.runtime.lastError;
        current_device = undefined;
        current_socket = undefined;
        if (!!error) {
          con.log("Disconnection failed", error);
          if (!!callback) {
            try { callback(error.message); } catch (e) {
              con.log("Error calling disconnect callback", e);
            }
          }
        } else {
          con.log("Sphero disconnected");
          if (!!callback) {
            try { callback(); } catch (e) {
              con.log("Error calling disconnect callback", e);
            }
          }
        }
      });
    }

    // Initialize listeners for Bluetooth state
    bt.onAdapterStateChanged.addListener(onAdapterStateChanged);
    bt.getAdapterState(onAdapterStateChanged);
    bt.onConnection.addListener(onConnection);

    // Functions for discovering and connecting to devices
    this.isReady = function () { return api_ready; };
    this.onReady = {
      "add": function (callback) {
        if (!!callback) {
          if (api_ready) {
            try { callback(); } catch (e) {
              con.log("Error calling onReady callback", e);
            }
            return;
          }
          readyCallbacks.push(callback);
        }
      }
    };
    this.getDevices = function () { return devices; };
    this.updateDevices = function (callback) { updateDevices(callback); };
    this.connect = function (device_id, callback) { connect(device_id, callback); };
    this.disconnect = function (callback) { disconnect(callback); };
    
    // Functions to actually controll the EV3
    
    this.motor = {};
    this.motor.start = function (ports, callback) {
      write(0, COMMAND_TYPE.DirectNoReply, 0, 0, [OP_CODE.OutputStart, 0, ports], callback);
    };
    
    this.motor.turnAtPower = function (ports, power, callback) {
      // Valid power values are between -100 and +100
      power = Math.min(100, Math.max(-100, power));
      write(0, COMMAND_TYPE.DirectNoReply, 0, 0, [OP_CODE.OutputPower, 0, ports, PARAMETER_SIZE.Byte, power], callback);
    };
    
    this.motor.stop = function (ports, brake) {
      write(0, COMMAND_TYPE.DirectNoReply, 0, 0, [OP_CODE.OutputStop, 0, ports, PARAMETER_SIZE.Byte, brake ? 0x01 : 0x00], callback);
    };

    // Functions mainly meant for debugging
    this.write = function (seq, commandType, globalSize, localSize, data) {
      write(seq, commandType, globalSize, localSize, data);
    };
    this.rawwrite = function (data) { rawwrite(data); };
    this.getSocket = function () { return current_socket; };
    this.getDevice = function () { return current_device; };
    this.getProfile = function () { return profile; };
  }

  global.ev3 = new EV3();

}(this));