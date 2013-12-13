(function (global) {
  "use strict";

  var
    ev3 = global.ev3,
    con = global.console,
    doc = global.document,
    status = doc.getElementById("status"),
    main = doc.getElementById("main"),
    controls = doc.getElementById("controls"),
    connect = doc.getElementById("connect");

  if (!ev3) {
    status.textContent = "Something went terribly wrong, EV3 API not loaded...";
    return;
  }
  
  status.textContent = "Waiting for EV3 API to become ready...";
  ev3.onReady.add(function () {
    var devices;
    status.textContent ="EV3 API ready, searching for devices...!";
    
    devices = ev3.getDevices();
    if (devices.length > 0) {
      status.textContent = "EV3 found! Controls enabled!";
      main.style.display = "block";
      connect.onclick = function () {
        connect.disabled = true;
        ev3.connect(0, function (error) {
          if (!!error) {
            status.textContent = error;
            connect.disabled = false;
          } else {
            // initialize();
            status.textContent = "EV3 connected, waiting for input...";
            controls.style.display = "block";
          }
        });
      };
    } else {
      status.textContent = "No devices found, make sure to pair with your EV3 first, then restart this app.";
    }
  });

}(this));