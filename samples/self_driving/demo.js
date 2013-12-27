(function (global) {
  "use strict";

  var
    ev3 = global.ev3,
    con = global.console,
    doc = global.document,
    status = doc.getElementById("status"),
    main = doc.getElementById("main"),
    controls = doc.getElementById("controls"),
    start = doc.getElementById("start"),
    stop = doc.getElementById("stop"),
    connect = doc.getElementById("connect"),
    stopping = false,
    running = false,
    evading = false, evadeTime = 0,
    rotating = false, rotateTime = 0,
    currentTime,
    loop;

  if (!ev3) {
    status.textContent = "Something went terribly wrong, EV3 API not loaded...";
    return;
  }
  
  function next() {
    global.requestAnimationFrame(loop);
  }
  
  function evade() {
    evading = true;
    evadeTime = 0;
    ev3.motors.stop(ev3.OUTPUT_PORT.A | ev3.OUTPUT_PORT.D);
    ev3.motors.turnAtPower(ev3.OUTPUT_PORT.A | ev3.OUTPUT_PORT.D, -50);
    ev3.motors.start(ev3.OUTPUT_PORT.A | ev3.OUTPUT_PORT.D, next);
  }
  
  function rotate() {
    rotating = true;
    rotateTime = 0;
    ev3.motors.stop(ev3.OUTPUT_PORT.A | ev3.OUTPUT_PORT.D);
    ev3.motors.turnAtPower(ev3.OUTPUT_PORT.A, -20);
    ev3.motors.turnAtPower(ev3.OUTPUT_PORT.D, 20);
    ev3.motors.start(ev3.OUTPUT_PORT.A | ev3.OUTPUT_PORT.D, next);
  }
  
  function run() {
    running = true;
    ev3.motors.stop(ev3.OUTPUT_PORT.A | ev3.OUTPUT_PORT.D);
    ev3.motors.turnAtPower(ev3.OUTPUT_PORT.A | ev3.OUTPUT_PORT.D, 50);
    ev3.motors.start(ev3.OUTPUT_PORT.A | ev3.OUTPUT_PORT.D, next);
  }
  
  loop = function () {
    var
      now = (new Date()).getTime(),
      elapsed = now - currentTime;
    
    currentTime = now;
    if (stopping) {
      stopping = false;
      ev3.motors.stop(ev3.OUTPUT_PORT.All, false);
      return;
    }
    
    if (running) {
      // Infrared sensor
      ev3.sensors.readySI(ev3.INPUT_PORT.Four, 0, function (value) {
        if (value <= 25) {
          running = false;
          evade();
        } else {
          // Touch sensor
          ev3.sensors.readySI(ev3.INPUT_PORT.One, 0, function (value) {
            if (value == 1) {
              running = false;
              evade();
            } else {
              next(); 
            }
          });
        }
      });
      return;
    }
    
    if (evading) {
      evadeTime += elapsed;
      if (evadeTime > 1500) {
        evading = false;
        rotate();
      } else {
        next();
      }
      return;
    }
    
    if (rotating) {
      rotateTime += elapsed;
      if (rotateTime > 1500) {
        rotating = false;
        run();
      } else {
        next();
      }
      return;
    }
  };
  
  function stopRobot() {
    stopping = true;
  }
  
  function initialize() {
    start.onclick = function () {
      currentTime = (new Date()).getTime();
      running = true;
      run();
    };
    stop.onclick = stopRobot;
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
            initialize();
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