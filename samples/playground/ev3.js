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
      seq = 0x0000,
      commandQueue,
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
        "OutputTimeSync": 0xB1,
        "UIRead_GetFirmware": [0x81, 0x0A],
        "UIWrite_LED": [0x82, 0x1B],
        "UIButton_Pressed": [0x83, 0x09],
        "UIDraw_Update": [0x84, 0x00],
        "UIDraw_Clean": [0x84, 0x01],
        "UIDraw_Pixel": [0x84, 0x02],
        "UIDraw_Line": [0x84, 0x03],
        "UIDraw_Circle": [0x84, 0x04],
        "UIDraw_Text": [0x84, 0x05],
        "UIDraw_FillRect": [0x84, 0x09],
        "UIDraw_Rect": [0x84, 0x0A],
        "UIDraw_InverseRect": [0x84, 0x10],
        "UIDraw_SelectFont": [0x84, 0x11],
        "UIDraw_Topline": [0x84, 0x12],
        "UIDraw_FillWindow": [0x84, 0x13],
        "UIDraw_DotLine": [0x84, 0x15],
        "UIDraw_FillCircle": [0x84, 0x18],
        "UIDraw_BmpFile": [0x84, 0x1C],
        
        "Sound_Break": [0x94, 0x00],
        "Sound_Tone": [0x94, 0x01],
        "Sound_Play": [0x94, 0x02],
        "Sound_Repeat": [0x94, 0x03],
        "Sound_Service": [0x94, 0x04],
        
        "InputDevice_GetTypeMode": [0x99, 0x05],
        "InputDevice_GetDeviceName": [0x99, 0x15],
        "InputDevice_GetModeName": [0x99, 0x16],
        "InputDevice_ReadyPct": [0x99, 0x1B],
        "InputDevice_ReadyRaw": [0x99, 0x1C],
        "InputDevice_ReadySI": [0x99, 0x1D],
        "InputDevice_ClearAll": [0x99, 0x0A],
        "InputDevice_ClearChanges": [0x99, 0x1A],
        
        "InputRead": 0x9a,
        "InputReadExt": 0x9e,
        "InputReadSI": 0x9d
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

    function safeCallback(callback, data, error) {
      if (!!callback) {
        global.setTimeout(function () {
          try { callback(data, error); } catch(e) {
            con.log("Error calling callback", e);
          }
        }, 0);
      }
    }

    commandQueue = {
      queue: [],
      running: false,
      add:
        function (command, callback) {
          this.queue.push({"command": command, "callback": callback});
          if (!this.running) {
            this.run(); 
          }
        },
      run:
        function () {
          var current, that = this;
          this.running = true; 
          current = this.queue.shift();
          current.command.execute(function (data, error) {
            safeCallback(current.callback, data, error);
            if (that.queue.length > 0) {
              that.run();
            } else {
              that.running = false; 
            }
          });
        }
    };

    function waitForResponse(callback, timeout) {
      bt.read({"socket": current_socket}, function (data) {
        var result = new global.Uint8Array(data);
        if (result.length > 0) {
          // TODO: Error handling
          callback(result);
        } else {
          if (timeout <= 0) {
            callback(null, "No response");
          } else {
            global.setTimeout(function () {
              waitForResponse(callback, timeout - 10);
            }, 10);
          }
        }
      });
    }

    function Command(type, globalSize, localSize) {
      this.type = type;
      this.data = [];
      
      this.data.push(type);

      if (type === COMMAND_TYPE.DirectReply || type === COMMAND_TYPE.DirectNoReply) {
        // 2 bytes (llllllgg gggggggg)
        this.data.push(globalSize & 0xFF);
        this.data.push(((localSize << 2) | ((globalSize >> 8) & 0x03)) & 0xFF);
      }
    }
    
    Command.prototype.addOpCode = function (code) {
      if (code instanceof Array) {
        this.data.push(code[0]);
        this.data.push(code[1]);
      } else {
        this.data.push(code);
      }
    };
    
    Command.prototype.add = function (value) {
      this.data.push(value);
    };
    
    Command.prototype.addGlobalIndex = function (index) {
      this.data.push(0xE1);
      this.data.push(index);
    };
    
    Command.prototype.addByte = function (value) {
      this.data.push(PARAMETER_SIZE.Byte);
      this.data.push(value);
    };
    
    Command.prototype.addInt = function (value) {
      this.data.push(PARAMETER_SIZE.Int);
      this.data.push(value);
      this.data.push(value >> 8);
      this.data.push(value >> 16);
      this.data.push(value >> 24);
    };

    Command.prototype.execute = function (callback) {
      var buffer, view, i, l, that = this;

      if (!current_device || !current_socket) {
        safeCallback(callback, null, "No connection");
        return;
      }
      
      if (seq >= 0xFFFF) {
        seq = 0x0000;
      }
      seq += 1;
      
      l = this.data.length + 2;
      buffer = new global.ArrayBuffer(l + 2);
      view = new global.Uint8Array(buffer);
      view[0] = l & 0xFF;
      view[1] = (l >> 8) & 0xFF;
      view[2] = seq & 0xFF;
      view[3] = (seq >> 8) & 0xFF;

      for (i = 0; i < this.data.length; i++) {
        view[4 + i] = this.data[i] & 0xFF;
      }
      bt.write({"socket": current_socket, "data": buffer}, function () {
        if (that.type ===  COMMAND_TYPE.DirectReply) {
          waitForResponse(function (data, error) {
            safeCallback(callback, data, error);
          }, 1000);
        } else {
          safeCallback(callback, true); 
        }
      });
    };

    function onDeviceDiscovered(device) {
      con.log(device);
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
            while (readyCallbacks.length > 0) {
              callback = readyCallbacks.pop();
              try { callback(); } catch (e) {
                con.log("Error calling onReady callback", e);
              }
            }
          });
        });
      }
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
          // Reset sequence counter
          seq = 0x0000;
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
          con.log("EV3 disconnected");
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

    this.motors = {};

    this.motors.start = function (ports, callback) {
      var command = new Command(COMMAND_TYPE.DirectNoReply, 0, 0);
      command.addOpCode(OP_CODE.OutputStart);
      command.addByte(0x00);
      command.addByte(ports);

      commandQueue.add(command, callback);
    };

    this.motors.turnAtPower = function (ports, power, callback) {
      var command = new Command(COMMAND_TYPE.DirectNoReply, 0, 0);
      
      // Valid power values are between -100 and +100
      power = Math.min(100, Math.max(-100, power));

      command.addOpCode(OP_CODE.OutputPower);
      command.addByte(0x00);
      command.addByte(ports);
      command.addByte(power);
      
      commandQueue.add(command, callback);
    };

    this.motors.turnAtSpeed = function (ports, speed, callback) {
      var command = new Command(COMMAND_TYPE.DirectNoReply, 0, 0);
      
      // Valid speed values are between -100 and +100
      speed = Math.min(100, Math.max(-100, speed));

      command.addOpCode(OP_CODE.OutputSpeed);
      command.addByte(0x00);
      command.addByte(ports);
      command.addByte(speed);
      
      commandQueue.add(command, callback);
    };
    
    this.motors.stepAtPower = function (ports, power, rampup, constant, rampdown, brake, callback) {
      var command = new Command(COMMAND_TYPE.DirectNoReply, 0, 0);
      
      // Valid power values are between -100 and +100
      power = Math.min(100, Math.max(-100, power));

      command.addOpCode(OP_CODE.OutputStepPower);
      command.addByte(0x00);
      command.addByte(ports);
      command.addByte(power);
      command.addInt(rampup);
      command.addInt(constant);
      command.addInt(rampdown);
      command.addByte(brake ? 1 : 0);
      
      commandQueue.add(command, callback);
    };
    
    this.motors.stepAtSpeed = function (ports, speed, rampup, constant, rampdown, brake, callback) {
      var command = new Command(COMMAND_TYPE.DirectNoReply, 0, 0);
      
      // Valid speed values are between -100 and +100
      speed = Math.min(100, Math.max(-100, speed));

      command.addOpCode(OP_CODE.OutputStepSpeed);
      command.addByte(0x00);
      command.addByte(ports);
      command.addByte(speed);
      command.addInt(rampup);
      command.addInt(constant);
      command.addInt(rampdown);
      command.addByte(brake ? 1 : 0);
      
      commandQueue.add(command, callback);
    };
    
    this.motors.turnAtPowerForTime = function (ports, power, rampup, constant, rampdown, brake, callback) {
      var command = new Command(COMMAND_TYPE.DirectNoReply, 0, 0);
      
      // Valid power values are between -100 and +100
      power = Math.min(100, Math.max(-100, power));

      command.addOpCode(OP_CODE.OutputTimePower);
      command.addByte(0x00);
      command.addByte(ports);
      command.addByte(power);
      command.addInt(rampup);
      command.addInt(constant);
      command.addInt(rampdown);
      command.addByte(brake ? 1 : 0);
      
      commandQueue.add(command, callback);
    };
    
    this.motors.turnAtSpeedForTime = function (ports, speed, rampup, constant, rampdown, brake, callback) {
      var command = new Command(COMMAND_TYPE.DirectNoReply, 0, 0);
      
      // Valid speed values are between -100 and +100
      speed = Math.min(100, Math.max(-100, speed));

      command.addOpCode(OP_CODE.OutputTimeSpeed);
      command.addByte(0x00);
      command.addByte(ports);
      command.addByte(speed);
      command.addInt(rampup);
      command.addInt(constant);
      command.addInt(rampdown);
      command.addByte(brake ? 1 : 0);
      
      commandQueue.add(command, callback);
    };

    this.motors.stop = function (ports, brake, callback) {
      var command = new Command(COMMAND_TYPE.DirectNoReply, 0, 0);
      command.addOpCode(OP_CODE.OutputStop);
      command.addByte(0x00);
      command.addByte(ports);
      command.addByte(brake ? 1 : 0);

      commandQueue.add(command, callback);
    };
    
    this.getFirmwareVersion = function (callback) {
      var command = new Command(COMMAND_TYPE.DirectReply, 0x10, 0);
      command.addOpCode(OP_CODE.UIRead_GetFirmware);
      command.addByte(0x10);
      command.addGlobalIndex(0);
      
      commandQueue.add(command, function (data, error) {
        // TODO: extract actual data
        safeCallback(callback, data, error);
      });
    };

    // Parameter values to be used in functions

    this.OUTPUT_PORT = OUTPUT_PORT;


    // Functions/parameters mainly meant for debugging
    this.debug = {};
    this.debug.getSocket = function () { return current_socket; };
    this.debug.getDevice = function () { return current_device; };
    this.debug.getProfile = function () { return profile; };
    this.debug.COMMAND_TYPE = COMMAND_TYPE;
    this.debug.OP_CODE = OP_CODE;
    this.debug.PARAMETER_SIZE = PARAMETER_SIZE;
    this.debug.Command = Command;
  }

  global.ev3 = new EV3();

}(this));