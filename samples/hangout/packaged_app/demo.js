(function (global) {
  "use strict";

  var
    ev3 = global.ev3,
    status = global.document.getElementById("status"),
    EXTENSION_ID = "{ID OF CONTENT SCRIPT EXTENSION}";

  if (!ev3) {
    status.textContent = "Something went terribly wrong, EV3 API not loaded...";
    return;
  }

  status.textContent = "Waiting for input from Hangout...";

  global.chrome.runtime.onMessageExternal.addListener(function (message, sender, sendResponse) {
    if (sender.id === EXTENSION_ID) {
      if (!ev3.isReady()) {
        sendResponse({"error": "EV3 API not ready"});
        return false;
      }
      if (message.command === "connect") {
        ev3.connect(0, function (error) {
          if (!!error) {
            sendResponse({"error": error});
          } else {
            sendResponse({"success": true});
          }
        });
        return true;
      }
      if (message.command === "move") {
        switch(message.direction) {
          case "forward":
            ev3.motors.turnAtSpeedForTime(ev3.OUTPUT_PORT.A | ev3.OUTPUT_PORT.D, 50, 50, 500, 50, false);
            break;
          case "back":
            ev3.motors.turnAtSpeedForTime(ev3.OUTPUT_PORT.A | ev3.OUTPUT_PORT.D, -50, 50, 500, 50, false);
            break;
          case "right":
            ev3.motors.turnAtSpeedForTime(ev3.OUTPUT_PORT.A, 50, 50, 500, 50, false);
            ev3.motors.turnAtSpeedForTime(ev3.OUTPUT_PORT.D, -50, 50, 500, 50, false);
            break;
          case "left":
            ev3.motors.turnAtSpeedForTime(ev3.OUTPUT_PORT.A, -50, 50, 500, 50, false);
            ev3.motors.turnAtSpeedForTime(ev3.OUTPUT_PORT.D, 50, 50, 500, 50, false);
            break;
        }
        sendResponse({"success": true});
        return false;
      }
    }
  });
  
}(this));