/*
Copyright (c) 2013, Faculty of Information Technology, Monash University.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of Monash University nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/*
 * Author: Nicholas Smith
 *
 * The code in this module will need refactoring if it is to be extended to
 * add further functionality to the simulation.
 */

"use strict";

// Graphics variables
var scene;
var camera;
var projector = new THREE.Projector();
var nearClip = 1, farClip = 500;
var renderer;

// Variables concerning simulation limits for performance
var nodeSimCreditPerFrame = 125;
var nextNodeIndexToSimulate = -1;
var simulationFrozen = false;

// Oculus Rift variables. Note, Oculus Rift support is not complete/functional.
var usingRift = false;
if (usingRift) {
  var riftRenderer;
  var vrState = new vr.State();
}

// Control variables
var keyboardMoveSpeed = 50;
var mouseLookSensitivity = 2.5;

// Pointer/selection/interaction variables
var fingerPointer = new THREE.Vector2(); // The finger being used for pointing
var pointerCursor; // The cursor that shows the position of the pointer

var selectedNode = null;
var grabbedNode = null;

// Node switching transition variables
var nodeSwitchingTime = 2;
var maxSwitchingSpeedMultiplier = 5;
var nodeSwitchingCurveConstant = 4 / (nodeSwitchingTime * nodeSwitchingTime) * (maxSwitchingSpeedMultiplier-1);

var nodeHideTime = 0.2;

// Leap Motion variables
var leapMetresPerMM = 0.5;
var leapRadiansPerMM = 0.02;
var screenAspectRatio = 16/9;
var screenSize = 15.6 * 25.4; // in mm
var screenHeight = Math.sqrt(screenSize*screenSize/(screenAspectRatio*screenAspectRatio + 1));
var screenWidth = Math.sqrt(screenSize*screenSize - screenHeight*screenHeight);
var leapDistance = 250; // in mm
var leapHeight = 0; //relative to the bottom of the display

window.addEventListener('resize',
                          function(event) {
                            renderer.setSize(window.innerWidth, window.innerHeight);
                            camera.aspect = window.innerWidth/window.innerHeight;
                            camera.updateProjectionMatrix();
                          }
                         );

// Models the motion as we move the camera between nodes
function smoothMoveFunction(x)
{
  return 0.5*Math.atan(3.1148154*(x-0.5)) + 0.5;
}

function initializeScene()
{
  var canvasWidth = window.innerWidth;
  var canvasHeight = window.innerHeight;

  renderer = new THREE.WebGLRenderer({setClearColor: 0x000000, alpha: false, antialias: true});

  if (usingRift)
    riftRenderer = new THREE.OculusRiftEffect(renderer);
  else
    renderer.setSize(canvasWidth, canvasHeight);

  document.getElementById("WebGLCanvas").appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x444444, 90, 100);

  camera = new THREE.PerspectiveCamera(45, canvasWidth / canvasHeight, nearClip, farClip);
  camera.matrixAutoUpdate = true;
  camera.position.set(0, 0, 40);
  scene.add(camera);

  var pointLight = new THREE.PointLight(0xFFFFFF);
  pointLight.position.set(0, 0, 0);
  camera.add(pointLight);

  var pointerTexture = THREE.ImageUtils.loadTexture("glow.png");
  var pointerSpriteMaterial = new THREE.SpriteMaterial({map: pointerTexture, alignment: THREE.SpriteAlignment.center, opacity: 1});
  pointerCursor = new THREE.Sprite(pointerSpriteMaterial);
  pointerCursor.scale.set(48, 48, 1);
  scene.add(pointerCursor);
}

function zDistanceToCamera(position)
{
  return camera.forward.dot(position.clone().sub(camera.position));
}

function buildGraph()
{
  Node.newNodeLoadedFromScreenName("PootPooter", function(node) {
    if (node) {
      node.requestShow(true);
      node.requestShow(true);
      select(node);
    }
    else console.log("Failed to load starting user!");
  });
}

var lastMouseX = 0, lastMouseY = 0;
var highlightedNode = null;
var fingerLostMaxLenience = 10;
var fingerLostLenience = 0;
var pointingHandID = -1;
var pointingHandCheckedIn = false;
var maxPointingHandGrace = 10;
var pointingHandGrace = 0;
var grabbingHandCheckedIn = false;
var maxGrabbingHandGrace = 10;
var grabbingHandGrace = 0;
var maxGrabWarmup = 0.2;
var grabWarmup = -2; // -1 is 'ready' value, -2 is 'finished' value

/* Functions can be pushed to the coroutines array to be executed as if they are
 * occuring in parallel with the program execution.
 */
var coroutines = new Array();

function setCoroutine(data, func)
{
  data.func = func;
  coroutines.push(data);
}

function update(deltaTime)
{
  Input.update();

  // Execute coroutines
  for (var i = 0; i < coroutines.length;) {
    if (coroutines[i].func(coroutines[i], deltaTime))
      coroutines.splice(i, 1);
    else
      ++i;
  }

  // Rift config buttons
  if (usingRift) {
    if (Input.keyboard.keyPressed['f']) {
      if (!vr.isFullScreen())
        vr.enterFullScreen();
      else
        vr.exitFullScreen();
    }
    if (Input.keyboard.keyPressed['r'])
      vr.resetHmdOrientation();
    if (Input.keyboard.keyPressed['o'])
      riftRenderer.setInterpupillaryDistance(
                  riftRenderer.getInterpupillaryDistance() - 0.001);
    if (Input.keyboard.keyPressed['p'])
      riftRenderer.setInterpupillaryDistance(
                  riftRenderer.getInterpupillaryDistance() + 0.001);
  }

  var backwardsRotation = camera.quaternion.clone();
  backwardsRotation.x *= -1;
  backwardsRotation.y *= -1;
  backwardsRotation.z *= -1;

  var dx = 0, dy = 0, dz = 0;
  // Reset the finger point position every frame so that the finger spot
  // isn't drawn when we lose sight of the finger

  // Check for hand motions and gestures

  var hands = Input.currLeapFrame.hands;
  if (hands.length > 0) {
    checkHandInput(hands[0]);
    if (hands.length > 1)
      checkHandInput(hands[1]);
  }

  // Missing hands (or missing gestures) are addressed here,
  // with a grace period for their return
  if (pointingHandID !== -1) {
    if (!pointingHandCheckedIn) {
      --pointingHandGrace;
      if (pointingHandGrace < 0) {
        pointingHandID = -1;
      }
    }
    else pointingHandGrace = maxPointingHandGrace;

    if (!grabbingHandCheckedIn && grabbedNode != null) {
      --grabbingHandGrace;
      if (grabbingHandGrace < 0) {
        releaseGrab();
      }
    }
    else grabbingHandGrace = maxGrabbingHandGrace;
  }
  pointingHandCheckedIn = false;
  grabbingHandCheckedIn = false;

  function checkHandInput(hand) {
    var fingers = hand.fingers;

    if (fingers.length === 1) {
      Input.currentPointer = fingerPointer;

      // Try and claim this hand as the pointing hand
      if (pointingHandID === -1) {
        pointingHandID = hand.id;
      }

      if (pointingHandID === hand.id) {
        pointingHandCheckedIn = true;
        if (fingerPointer.id !== fingers[0].id) {
          // Give a few frames slack if we can't find the finger we had before
          if (fingerLostLenience > 0) {
            --fingerLostLenience;
            return;
          }
          else {
            fingerPointer.id = fingers[0].id;
          }
        }
        fingerLostLenience = fingerLostMaxLenience;
        fingerPointer.copy(getFingerOnScreenNDC(fingers[0]));
      }
    }
    else if (pointingHandID === hand.id && fingers.length === 2) {
      // If we see two fingers but one is the finger we were already tracking,
      // ignore the second finger.
      pointingHandCheckedIn = true;
      if (fingers[0].id === fingerPointer.id) {
        fingerPointer.copy(getFingerOnScreenNDC(fingers[0]));
        //console.log("Lenient.");
      }
      else if (fingers[1].id === fingerPointer.id) {
        fingerPointer.copy(getFingerOnScreenNDC(fingers[1]));
        //console.log("Lenient.");
      }
    }

    if (pointingHandID === -1) {
      if (hands.length === 1 && fingers.length >= 4) {
        var t = hand.translation(Input.prevLeapFrame);
        dx = -t[0] * leapRadiansPerMM;
        dy = t[1] * leapRadiansPerMM;
        dz = -t[2] * leapMetresPerMM;
      }
    }
    else if (pointingHandID !== hand.id) {
      grabbingHandCheckedIn = true;
      if (grabWarmup === -1) {
        if (fingers.length < 2) {
          grabWarmup = maxGrabWarmup;
        }
      }
      else if (fingers.length >= 4) {
        releaseGrab();
        grabWarmup = -1;
      }
      else if (grabWarmup > 0) {
        grabWarmup -= deltaTime;
      }
      else if (grabWarmup !== -2) {
        grabWarmup = -2;
        selectWithCurrentPointer();
      }
    }
  }

  // Calculate how far apart the user's hands were moved in the last 8 Leap frames.
  var scaleOut = 0;
  if (hands.length === 2) {
    var oldHands = Input.leap.frame(8).hands;
    if (oldHands.length === 2) {
      var handsDis = hands[1].palmPosition[0] - hands[0].palmPosition[0];
      if (handsDis < 0)
        handsDis *= -1;
      var oldHandsDis = oldHands[1].palmPosition[0] - oldHands[0].palmPosition[0];
      if (oldHandsDis < 0)
        oldHandsDis *= -1;
      scaleOut = handsDis - oldHandsDis;
    }
  }

  // Check key pressees

  if (Input.keyboard.keyPressed['1'] || scaleOut > 100) {
    simulationFrozen = false;
    selectedNode.expand();
  }

  if (Input.keyboard.keyPressed['2'] || scaleOut < -100) {
    simulationFrozen = false;
    var hiddenArray = [];
    selectedNode.collapse(hiddenArray);
    // Construct a counter object to be passed to all coroutines:
    // the last finished coroutine can do the finalizing work
    var counterObj = {count: hiddenArray.length};
    counterObj.sub = function() {
      return --this.count;
    }

    for (var i = 0; i < hiddenArray.length; ++i) {
      setCoroutine({counter: counterObj, currentTime: 0, endTime: nodeHideTime, subject: hiddenArray[i], origin: hiddenArray[i].position.clone(), target: selectedNode, newPos: new THREE.Vector3()},
                   function(o, deltaTime) {
                     o.currentTime += deltaTime;

                     if (o.currentTime >= o.endTime) {
                       o.subject.hide();
                       if (o.counter.sub() === 0) {
                         o.target.collapsing = false;
                         o.target.expanded = false;
                       }
                       return true;
                     }
                     else {
                       o.newPos.copy(o.target.position).sub(o.origin).multiplyScalar(o.currentTime/o.endTime).add(o.origin);
                       o.subject.position.copy(o.newPos);
                     }
                   }
      );
    }
  }

  if (Input.keyboard.keyPressed[' '])
    simulationFrozen = !simulationFrozen;

  // Now that we've checked for finger pointers, we can know whether
  // to interpet mouse input or not
  if (Input.currentPointer === Input.mouse) {
    if (Input.mouse.rightHeld) {
      dx = -(Input.mouse.x - lastMouseX) * mouseLookSensitivity;
      dy = (Input.mouse.y - lastMouseY) * 0.7 * mouseLookSensitivity;
    }
  }

  lastMouseX = Input.mouse.x;
  lastMouseY = Input.mouse.y;

  // Move the pointer cursor sprite to the pointer's position
  var pc = NDCToPixelCoordinates(Input.currentPointer);
  pointerCursor.position.x = pc.x;
  pointerCursor.position.y = pc.y;

  // Highlight the node last under the pointer
  var newHighlightedNode = getNodeUnderPointer(Input.currentPointer);
  if (newHighlightedNode !== null) {
    unhighlight();
    highlight(newHighlightedNode);
  }

  if (Input.keyboard.key['w'])
    dz = -keyboardMoveSpeed*deltaTime;

  if (Input.keyboard.key['s'])
    dz = keyboardMoveSpeed*deltaTime;

  var displacement = centreOfFocus.clone().sub(camera.position);
  // Move the camera to the centroid
  camera.position.add(displacement);

  // Rotate/zoom the camera
  if (dx !== 0)
    camera.rotateOnAxis(new THREE.Vector3(0, 1, 0), dx);
  if (dy !== 0)
    camera.rotateOnAxis(new THREE.Vector3(1, 0, 0), dy);
  if (dz !== 0)
    camera.position.add(new THREE.Vector3(0, 0, dz).applyQuaternion(camera.quaternion));

  // Apply the same rotation we made to the camera to the displacement vector
  displacement.applyQuaternion(camera.quaternion.clone().multiply(backwardsRotation));
  // Move the camera away from the centroid again
  camera.position.sub(displacement);

  // Apply the changes to the camera
  camera.updateMatrixWorld(true);
  // Calculate camera up, forward and right vectors
  camera.forward = projector.unprojectVector(new THREE.Vector3(0, 0, 0.5), camera).sub(camera.position).normalize();
  var pos = projector.unprojectVector(new THREE.Vector3(0, 1, 0.5), camera).sub(camera.position);
  camera.up = pos.sub(camera.forward.clone().multiplyScalar(pos.dot(camera.forward))).normalize();
  camera.right = camera.forward.clone().cross(camera.up).normalize();

  // Update the graph
  if (!simulationFrozen) {
    var ids = Object.keys(Node.shownNodes);
    var numNodes = ids.length;

    for (var id in Node.shownNodes)
      Node.shownNodes[id].addTime(deltaTime);

    // Do a physics update for as many nodes as we have an allowance for
    var nodeSimCredit = nodeSimCreditPerFrame;
    var n = nextNodeIndexToSimulate;
    var nodesLeft = numNodes;
    while (nodesLeft > 0 && nodeSimCredit > 0) {
      n = (n+1) % ids.length;
      Node.shownNodes[ids[n]].calculateForces();
      --nodesLeft;
      --nodeSimCredit;
    }
    nodeSimCredit = nodeSimCreditPerFrame;
    n = nextNodeIndexToSimulate;
    nodesLeft = numNodes;
    while (nodesLeft > 0 && nodeSimCredit > 0) {
      n = (n+1) % ids.length;
      Node.shownNodes[ids[n]].applyForces();
      --nodesLeft;
      --nodeSimCredit;
    }

    nextNodeIndexToSimulate = n;
  }

  // Update the edges
  for (var i = 0; i < Node.edges.length; ++i)
    Node.edges[i].update(camera, projector);

  // Update the components of all nodes (text bubble etc)
  for (var id in Node.shownNodes)
    Node.shownNodes[id].updateComponents(deltaTime, camera, projector);

  // Set the fog distance
  var distance = zDistanceToCamera(centreOfFocus);
  scene.fog.near = distance*2;
  scene.fog.far = distance*2.5;

  Input.reset();
}

var fingerSmoothingLevel = 3;
var fingerPositions = new Array();
for (var i = 0; i < fingerSmoothingLevel; ++i)
  fingerPositions[i] = [1, 1, 1];
var fpi = 0;

// Gets the position of the finger on the screen in Normalized Device Coordinates.
function getFingerOnScreenNDC(finger)
{
  var pos = finger.tipPosition.slice(0);
  var dir = finger.direction;

  // Get the position of the finger tip relative to screen centre
  pos[1] += leapHeight - screenHeight/2;
  pos[2] += leapDistance;
  // Follow finger tip over to screen surface
  var factor = -pos[2] / dir[2];
  pos[0] += dir[0]*factor;
  pos[1] += dir[1]*factor;
  pos[2] += dir[2]*factor;
  // pos[0] & pos[1] are now mm from screen centre
  // Calculate the pointing position on the virtual screen from [-1, 1] (Normalized Device Coordinates)
  fingerPositions[fpi] = [pos[0] / (0.5*screenWidth), pos[1] / (0.5*screenHeight)];
  fpi = (fpi+1)%fingerSmoothingLevel;
  var smoothed = averageOfVectors(fingerPositions, fingerSmoothingLevel);

  var NDC = new THREE.Vector2();
  NDC.x = smoothed[0];
  NDC.y = smoothed[1];
  return NDC;
}

function averageOfVectors(vectors, numVectors)
{
  var result = new Array();
  for (var i = 0; i < vectors[0].length; ++i) {
    result[i] = 0;
    for (var j = 0; j < numVectors; ++j)
      result[i] += vectors[j][i];
    result[i] /= numVectors;
  }
  return result;
}

/*
 * Convert a vector in Normalized Device Coordinates to screen coordinates.
 */
function NDCToPixelCoordinates(NDC)
{
  var pixelCoords = new THREE.Vector2();
  pixelCoords.x = (NDC.x + 1)/2 * window.innerWidth;
  pixelCoords.y = (-NDC.y + 1)/2 * window.innerHeight;
  return pixelCoords;
}

function getNodeUnderPointer(pointer)
{
  var pointerNDC = new THREE.Vector3(pointer.x, pointer.y, 1);
  projector.unprojectVector(pointerNDC, camera);
  var directionVector = pointerNDC.sub(camera.position);
  directionVector.normalize();

  var raycaster = new THREE.Raycaster(camera.position, directionVector, nearClip, farClip);
  var intersected = raycaster.intersectObjects(scene.children, true);

  for (var i = 0; i < intersected.length; ++i) {
    if (intersected[i].object.node) {
      return intersected[i].object.node;
    }
  }

  return null;
}

function draw()
{
  if (usingRift) {
    var polled = vr.pollState(vrState);
    riftRenderer.render(scene, camera, polled ? vrState : null);
  }
  else renderer.render(scene, camera);
}

/*
 * Select the node currently under the current pointer.
 */
function selectWithCurrentPointer()
{
  // Safeguard in case we still have somebody grabbed
  releaseGrab();
  var newSelectedNode = getNodeUnderPointer(Input.currentPointer);
  if (newSelectedNode !== null) {
    if (newSelectedNode.selected) {
      newSelectedNode.DOSOMETHING
    }
    else {
      select(newSelectedNode);
    }
  }
}

function highlight(node)
{
  highlightedNode = node;
  node.highlight();
}

function unhighlight()
{
  if (highlightedNode !== null) {
    highlightedNode.unhighlight();
    highlightedNode = null;
  }
}

// The position of the centre of focus for the camera.
var centreOfFocus = new THREE.Vector3();

// Select the given node. We allow no deselection
// without subsequent selection because we must
// always have a node as the centre of focus.
function select(node)
{
  if (selectedNode !== null) {
    selectedNode.deselect();
    var displacement = node.position.clone().sub(centreOfFocus);


    setCoroutine({currentTime: 0, endTime: nodeSwitchingTime, target: node.position, displacement: new THREE.Vector3()},
                 function(o, deltaTime) {
                   function speedMultiplier(x) {
                     return 1 - nodeSwitchingCurveConstant*x*(x-o.endTime);
                   }

                   deltaTime *= speedMultiplier(o.currentTime);
                   o.currentTime += deltaTime;

                   if (o.currentTime >= o.endTime) {
                     camera.position.add(displacement.copy(o.target).sub(centreOfFocus));
                     centreOfFocus.copy(o.target);
                     return true;
                   }
                   else {
                     o.displacement.copy(o.target).sub(centreOfFocus).multiplyScalar(deltaTime/(o.endTime-o.currentTime));
                     centreOfFocus.add(o.displacement);
                     camera.position.add(o.displacement);
                   }
                 }
    );
  }
  else {
    centreOfFocus.copy(node.position);
    camera.lookAt(centreOfFocus);
  }

  selectedNode = node;
  node.select();
}

function grab(node)
{
  grabbedNode = node;
  node.grab();
}

function releaseGrab()
{
  if (grabbedNode !== null) {
    grabbedNode.releaseGrab();
    grabbedNode = null;
  }
}

// Extra function for printing vectors when debugging
function printVector(v)
{
  console.log(v.x + ", " + v.y + ((typeof v.z !== "undefined")? (", " + v.z) : ""));
}

require(["Input", "UserNode"], main);
var Input, Node;

var requestAnimFrame = (function() {
  return  window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame    ||
    window.oRequestAnimationFrame      ||
    window.msRequestAnimationFrame     ||
    function(callback) {
    window.setTimeout(callback, 1000 / 60);
  };
})();

function mainLoop()
{
  nextUpdate();
  draw();
  requestAnimFrame(mainLoop);
}

var frameTimeLimit = 0.03;
var timeOfLastFrame = 0;

function nextUpdate()
{
  var currentTime = new Date().getTime();
  var deltaTime = (currentTime - timeOfLastFrame)/1000;
  timeOfLastFrame = currentTime;

  // Limit the maximum time step
  if (deltaTime > frameTimeLimit)
    update(frameTimeLimit);
  else
    update(deltaTime);
}

function main(i, n) {
  Input = i;
  Node = n;

  Input.mouse.leftPressedCallback = selectWithCurrentPointer;
  Input.mouse.leftReleasedCallback = releaseGrab;

  initializeScene();
  buildGraph();
  timeOfLastFrame = new Date().getTime();
  mainLoop();
}



