/**
 An **VRMLModel** is a {{#crossLink "Model"}}{{/crossLink}} that loads itself from VRML files.

 ## Overview

 * Begins loading as soon as you set its {{#crossLink "VRMLModel/src:property"}}{{/crossLink}} property to the location of an OBJ file.
**/
import {Mesh} from "../../../scene/mesh/Mesh.js";
import {ReadableGeometry} from "../../../scene/geometry/ReadableGeometry.js";
import {VBOGeometry} from "../../../scene/geometry/VBOGeometry.js";
import {PhongMaterial} from "../../../scene/materials/PhongMaterial.js";
import {Texture} from "../../../scene/materials/Texture.js";
import {core} from "../../../scene/core.js";
import {Node} from "./../../../scene/nodes/Node.js";
import {Geometry} from "./../../../scene/geometry/Geometry.js";
import {MetallicMaterial} from "./../../../scene/materials/MetallicMaterial.js";
import {SpecularMaterial} from "./../../../scene/materials/SpecularMaterial.js";
import {LambertMaterial} from "./../../../scene/materials/LambertMaterial.js";
import {utils} from "./../../../scene/utils.js";
import {math} from "./../../../scene/math/math.js";
import {DirLight} from "./../../../scene/lights/DirLight.js";

//import {vrmlParser} from "./libs/vrml.js";

class VRMLLoader {
	constructor(owner, cfg={}) {
		this._src = null;
		this.src = cfg.src;
		this.debug = false;
	}


        /**
         Path to an VRML file.

         You can set this to a new file path at any time (except while loading), which will cause the VRMLModel to load components from
         the new file (after first destroying any components loaded from a previous file path).

         Fires a {{#crossLink "VRMLModel/loaded:event"}}{{/crossLink}} event when the VRML has loaded.

         @property src
         @type String
         */
        set src(value) {
            if (!value) {
                return;
            }
            if (!_isString(value)) {
                this.error("Value for 'src' should be a string");
                return;
            }
            if (value === this._src) { // Already loaded this VRMLModel

                /**
                 Fired whenever this VRMLModel has finished loading components from the VRML file
                 specified by {{#crossLink "VRMLModel/src:property"}}{{/crossLink}}.
                 @event loaded
                 */
                this.fire("loaded", true, true);
                return;
            }
            this.clear();
            this._src = value;
            VRMLModel.load(this, this._src, this._options);
        }

        get source() {
            return this._src;
        }


        destroy() {
            this.destroyAll();
            super.destroy();
        }


        /**
         * Loads VRML from a URL into a {{#crossLink "Model"}}{{/crossLink}}.
         *
         * @method load
         * @static
         * @param {Model} model Model to load into.
         * @param {String} src Path to VRML file.
         * @param {Function} [ok] Completion callback.
         * @param {Function} [error] Error callback.
         */
        load(model, src, ok, error) {
			//to be done , zip file with jszip
            var spinner = model.scene.canvas.spinner;
            spinner.processes++;
            load(model, src, function () {
                    spinner.processes--;
                    //scheduleTask(function () {
                        model.fire("loaded", true, true);
                    //});
                    if (ok) {
                    //    ok();
                    }
                },
                function (msg) {
                    spinner.processes--;
                    model.error(msg);
                    if (error) {
                        error(msg);
                    }
                    /**
                     Fired whenever this VRMLModel fails to load the STL file
                     specified by {{#crossLink "VRMLModel/src:property"}}{{/crossLink}}.
                     @event error
                     @param msg {String} Description of the error
                     */
                    model.fire("error", msg);
                });
        }


		/**
     * Loads VRML from file(s) into a {@link Node}.
     *
     * @static
     * @param {Node} modelNode Node to load into.
     * @param {String} src Path to OBJ file.
     * @param {Object} params Loading options.
     */
    parse(model, vrmlData, basePath,options) {
            if (!vrmlData) {
                this.warn("load() param expected: vrmlData");
                return;
            }
            var state = parse(model, vrmlData, options);

            createMeshes(model, state);
            model.src = null;
            model.fire("loaded", true, true);
	}

};

//--------------------------------------------------------------------------------------------
// Loads VRML
// Build for EPLAN P8 Export
// By Nicolas Fournier (nic_rf)
// Use https://github.com/bartmcleod/VrmlParser libs
//
// Originally based on the THREE.js VRML loaders: 
//
// https://github.com/mrdoob/three.js/blob/dev/examples/js/loaders/OBJLoader.js
// https://github.com/mrdoob/three.js/blob/dev/examples/js/loaders/MTLLoader.js
// https://github.com/mrdoob/three.js/blob/dev/examples/js/loaders/VRMLLoader.js
// 
//--------------------------------------------------------------------------------------------

    var load = function (model, url, ok) {
        loadFile(url, function (text) {
                var state = parse(text, model, url);
                ok(state);
            },
            function (error) {
                model.error(error);
            });
    };

	function parse(data, model, options) {
		var debug = options.debug ? options.debug : true;
		var showInfo = options.showInfo ? options.showInfo : true;
		var defines = {};
		var totalNode = 0;
		var doneNode = 0;
		
        const WebGLConstants = {
            34963: 'ELEMENT_ARRAY_BUFFER',  //0x8893
            34962: 'ARRAY_BUFFER',          //0x8892
            5123: 'UNSIGNED_SHORT',         //0x1403
            5126: 'FLOAT',                  //0x1406
            4: 'TRIANGLES',                 //0x0004
            35678: 'SAMPLER_2D',            //0x8B5E
            35664: 'FLOAT_VEC2',            //0x8B50
            35665: 'FLOAT_VEC3',            //0x8B51
            35666: 'FLOAT_VEC4',            //0x8B52
            35676: 'FLOAT_MAT4'             //0x8B5C
        };

        const WEBGL_COMPONENT_TYPES = {
            5120: Int8Array,
            5121: Uint8Array,
            5122: Int16Array,
            5123: Uint16Array,
            5125: Uint32Array,
            5126: Float32Array
        };

        const WEBGL_TYPE_SIZES = {
            'SCALAR': 1,
            'VEC2': 2,
            'VEC3': 3,
            'VEC4': 4,
            'MAT2': 4,
            'MAT3': 9,
            'MAT4': 16
        };
		
		function addShape(data,parent) {	//model?		
			var mat = loadMaterial(data,parent);
			var geometry = buildGeometry(data.geometry);//loadGeometry(data,parent,model);
			//model._addComponent(mat)
			var mesh = new Mesh(model,{
					geometry:geometry,
					material: mat
			});
			return mesh;
		}
		
		function loadGeometry(data,parent) {		
			var geometrysInfo = data.geometry;
			if (geometrysInfo) {
				if (Array.isArray(geometrysInfo)){
					// group?
					/*var group = new Group();
					for (var i = 0, len = materialsInfo.length; i < len; i++) {
						var geometry = buildGeometry(geometrysInfo[i]);
						group.addChild(geometry);
						model._addComponent(geometry);	
					}
					return group;	*/						
				} else {
					return buildGeometry(geometrysInfo);
				}
			}			
		}
		
		function buildGeometry(data) {
			if (data.node ===undefined)
				return;
			var name = data.node + "_" + doneNode;
			if (data.name) {
				name = data.name;
			}
			if (debug === true ) {
				console.log("Shape as : "+ data.node);
			}
			if ( data.node === 'Box' ) {
				var s = data.size;
				return new BoxGeometry(model,{ // Half-size on each axis; BoxGeometry is actually two units big on each side.
				   id: name,
				   meta : {type : data.node},
				   xSize: s.x/2, 
				   ySize: s.y/2,
				   zSize: s.z/2
				});
			} else if (data.node === 'Cylinder') { //data.radius, data.radius, data.height
				return new CylinderGeometry(model,{
					id: name,
					meta : {type : data.node},
					radiusTop: data.radius,
					radiusBottom: data.radius,
					height:  data.height
				});
			} else if (data.node === 'Cone') {
				return new CylinderGeometry(model,{
					id: name,
					meta : {type : data.node},
					radiusTop: data.topRadius,
					radiusBottom: data.bottomRadius,
					height:  data.height
				});				
			} else if (data.node === 'Sphere') {
				return new SphereGeometry(model,{
					id: name,
					meta : {type : data.node},
					radius: data.radius,
				});				
			} else if (data.node === 'PointSet') {	//To be test
				var positions = [];
				var indices = []; 
				if (data.coord) {
					for (var i = 0; i < data.coord.point.length; i ++ ) {
						positions.push(data.coord.point[i].x,data.coord.point[i].y,data.coord.point[i].z);
					}
					indices = data.coordIndex.toString().split(",");
					return new VBOGeometry(model,{
						id: name,
						meta : {type : data.node},
						primitive: "points",
						positions: positions,
						indices: indices
					});
				}
			} else if (data.node === 'IndexedLineSet') {	//To be check , each array need to be a line system
				var positions = [];
				var indices = []; 
				if (data.coord) {
					for (var i = 0; i < data.coord.point.length; i ++ ) {
						positions.push(data.coord.point[i].x,data.coord.point[i].y,data.coord.point[i].z);
					}
					indices = data.coordIndex.toString().split(",");
					return new VBOGeometry(model,{
						id: name,
						meta : {type : data.node},
						primitive: "lines",
						positions: positions,
						indices:  indices,
						combined: true,
                        quantized: true,
					});
				}
			} else if (data.node === 'IndexedFaceSet') {	//To be done
			var positions = [];
				var indices = [];
				var uvs = [];				
				var faces = [];
				var face_uvs=[[0,0],[1,0],[1,1],[0,1]];
				if (data.coord) {
					// positions
					if ( data.texCoord) {
						uvs = data.texCoord.point;
					}
					for (var i = 0; i < data.coord.point.length; i ++ ) {
						if (!data.texCoord) {
							uvs.push(data.coord.point[i]);
						}
						positions.push(data.coord.point[i].x,data.coord.point[i].y,data.coord.point[i].z);
					}
					delete data.coord; //Free memory
					delete data.texCoord; //Free memory
				}
				if (data.coordIndex && data.coordIndex.length && data.coordIndex.length>0) {
					//Bug when we got -1 coordIndex to separate indices for each polygon - To be done - But EPLAN do not created face with multiple polygone
					// indices from faces		  
					for (var f = 0; f < data.coordIndex.length; f++) {
					  /*for(var j = 0; j < data.coordIndex[f].length; j++) {
						uvs=uvs.concat(face_uvs[j]);
					  }*/
					  for (i = 0; i < data.coordIndex[f].length - 2; i++) {
						  indices.push(data.coordIndex[f][0], data.coordIndex[f][i + 2], data.coordIndex[f][i + 1]);
					  }
					}
					delete data.coordIndex; //Free memory
				}
				var normals = [];
				positions = new Float32Array(positions);
				indices = new Uint16Array(indices)				
				//Build Normals
				//normals = math.buildNormals(positions,indices,normals);				
				var result =  math.mergeVertices(positions, normals, null, indices)
				//result.normals = math.buildNormals(result.positions,result.indices,result.normals);
				var creaseAngle = data.creaseAngle ? data.creaseAngle : 2;
				/*if (result.positions && result.positions.length && result.positions.length > 0) {					
					result = math.faceToVertexNormals(result.positions, result.normals, {smoothNormalsAngleThreshold : creaseAngle}); //Not working?
				}*/			
				return new VBOGeometry(model,{
						id: name,
						meta : {type : data.node},
						primitive: "triangles",
						positions: result.positions,
						indices: result.indices,
						normals: result.normals,
						combined: true,
                        quantized: true,
                        edgeThreshold: creaseAngle,
						autoVertexNormals :true,
					});
			}
		}		


		function loadMaterial(data,parent) {
			var appearance = data.appearance; //child??
			if (appearance) {
				var materialsInfo = appearance.material;
				var material;
				if (materialsInfo) {
					/*if (Array.isArray(materialsInfo)){
						for (var i = 0, len = materialsInfo.length; i < len; i++) {
							material = loadMaterialColorize(materialInfo[i]); //As option? is not use specularColor						
							//parent.addChild(material);
							model._addComponent(material);
						}
					} else {*/
						material =  loadMaterialColorize(materialsInfo); //As option? is not use specularColor							
						//model._addComponent(material);
						return material;
					//}
				}
			}			
			//ImageTexture tbd
		}
		
		function loadMaterialColorize(materialInfo) {
			var mat = new LambertMaterial(model);					
			//var mat = new PhongMaterial();					
            if (materialInfo.diffuseColor){
				//mat.diffuse =   [materialInfo.diffuseColor.x,materialInfo.diffuseColor.y, materialInfo.diffuseColor.z]
				mat.ambient =   [materialInfo.diffuseColor.x,materialInfo.diffuseColor.y, materialInfo.diffuseColor.z]
				mat.color =   [materialInfo.diffuseColor.x,materialInfo.diffuseColor.y, materialInfo.diffuseColor.z]
			}
			
			if (materialInfo.emissiveColor){
				mat.emissive =   [materialInfo.emissiveColor.x,materialInfo.emissiveColor.y, materialInfo.emissiveColor.z]
			}
			
			if (materialInfo.transparency) {
				mat.alpha = materialInfo.transparency;
			}
			return mat;
        }

		function parseNode(data,parent) {
			var name = "";	
			if (data.name) {
				name = data.name;	
			} else if (data.node){
				name = data.node;
			}
			if (debug === true ) {
				console.log("Parse an node " + data.node + " named " + name);
			}
			var object = parent;
			switch(data.node) {
				case 'Transform' :
				case 'Group' :
					object = new Node(model,{id : name, isModel: true,});									
					if (data.rotation) {
						var r = data.rotation;
						object.matrix= math.rotationMat4v(r.radians,[ r.x , r.y, r.z ]);
					}					
					if (data.translation) {
						var t = data.translation;
						object.position = [ t.x, t.y, t.z ];
					}
					if (data.scale) {
						var s = data.scale;
						object.scale = [ s.x, s.y, s.z ];
					}
					doneNode++;
					if (showInfo) {
						console.log("Node complete "+ doneNode + " of " + totalNode);
					}
					break;
				case 'Shape':
					object = addShape(data,parent);
					//object.id = name;
					break;
				case 'DirectionalLight':	//ambientIntensity 
					if (data.on) {
						object = new DirLight(model,{
							id : name,
							dir: [data.direction.x, data.direction.y, data.direction.z],
						});						
						if (data.color) {
							object.color = [data.color.x, data.color.y, data.color.z];
						}	
						if (data.intensity) {
							object.intensity = data.intensity;
						}
					}
					break;
				case 'PointLight':
					if (data.on) {
						object = new PointLight(model,{
							id : name,
							pos: [data.location.x, data.location.y, data.location.z],
						});						
						if (data.color) {
							object.color = [data.color.x, data.color.y, data.color.z];
						}	
						if (data.intensity) {
							object.intensity = data.intensity;
						}					
					}
					break;
				case 'IndexedFaceSet':
				case 'IndexedLineSet':
				case 'PointSet':
				case 'Sphere':
				case 'Cone':
				case 'Cylinder':
				case 'Box':
					object = buildGeometry(data.geometry,parent);
					break;
				case 'Light':
				case 'AmbientLight':
				case 'PointLight':
				case 'Background':
				case "OrientationInterpolator":
				case "PositionInterpolator":
				case "Viewpoint":
				case "NavigationInfo":
				case "Text":
				case "Inline":
				case "Switch":
				case "TimeSensor":
				case "TouchSensor":
				default:
					console.warn(data.node + " type node is not implemented")
					break;
				case undefined:
					console.error("Node is not defined")
					break;
			}
			if (parent != object) {
				object.id = name;
				defines[ object.id ] = object;
				//model._addComponent(object);
				if (parent !== undefined) {
					parent.addChild(object);
				}
			}
			if (data.children) {
				for ( var i = 0, l = data.children.length; i < l; i ++ ) {
					parseNode( data.children[ i ], object );
				}
			}			
		}
		
		function countNode (obj) {
			var count = 0;
			for (var property in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, property)) {
					count++;
				}
			}
			return count;
		}

		// Action
		model.clear();
		if (debug === true ) {
			console.log("Parse the file");
		}
		var tree = vrmlParser.parse(data);
		data = null; //Free memory
		if (debug === true ) {
			console.log(tree);
		}
		totalNode = countNode(tree.nodeDefinitions);
		delete tree.nodeDefinitions; //Free memory
		if (debug === true ) {
			console.log("Total node find : " + totalNode);
		}
		for ( var i = 0, l = tree.length; i < l; i ++ ) {
			parseNode(tree[i],model);
		}
		if (debug === true ) {
			console.log(defines);
		}
    }
    


function loadFile(url, ok, err) {
	var request = new XMLHttpRequest();
	request.open('GET', url, true);
	request.addEventListener('load', function (event) {
		var response = event.target.response;
		if (this.status === 200) {
			if (ok) {
				ok(response);
			}
		} else if (this.status === 0) {
			// Some browsers return HTTP Status 0 when using non-http protocol
			// e.g. 'file://' or 'data://'. Handle as success.
			console.warn('loadFile: HTTP Status 0 received.');
			if (ok) {
				ok(response);
			}
		} else {
			if (err) {
				err(event);
			}
		}
	}, false);

	request.addEventListener('error', function (event) {
		if (err) {
			err(event);
		}
	}, false);
	request.send(null);
}
var vrmlParser = (function() {
  "use strict";

  /*
   * Generated by PEG.js 0.9.0.
   *
   * http://pegjs.org/
   */

  function peg$subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }

  function peg$SyntaxError(message, expected, found, location) {
    this.message  = message;
    this.expected = expected;
    this.found    = found;
    this.location = location;
    this.name     = "SyntaxError";

    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, peg$SyntaxError);
    }
  }

  peg$subclass(peg$SyntaxError, Error);

  function peg$parse(input) {
    var options = arguments.length > 1 ? arguments[1] : {},
        parser  = this,

        peg$FAILED = {},

        peg$startRuleFunctions = { vrml: peg$parsevrml },
        peg$startRuleFunction  = peg$parsevrml,

        peg$c0 = "#VRML V2.0 utf8",
        peg$c1 = { type: "literal", value: "#VRML V2.0 utf8", description: "\"#VRML V2.0 utf8\"" },
        peg$c2 = function(vrml) {
        	    // before returning the root vrml object, enricht it with routes and nodeDefinitions
        		vrml.nodeDefinitions = nodeDefinitions;
        		vrml.routes = routes;
        		return vrml;
        	},
        peg$c3 = function(name) { return name; },
        peg$c4 = "OrientationInterpolator",
        peg$c5 = { type: "literal", value: "OrientationInterpolator", description: "\"OrientationInterpolator\"" },
        peg$c6 = function(name, properties) {
            	var n = {name:name, node: "OrientationInterpolator", isDefinition: true}
                for (var i=0; i < properties.length; i++) {
                	n[properties[i]['name']] = properties[i]['value'];
                }
                // store node for later re-use
                nodeDefinitions[name] = n;
                n.type = "OrientationInterpolator";
                return n;
            },
        peg$c7 = "keyValue",
        peg$c8 = { type: "literal", value: "keyValue", description: "\"keyValue\"" },
        peg$c9 = function(q) {return q;},
        peg$c10 = function(q, lq) {if(lq)q.push(lq);return q;},
        peg$c11 = function(quaternionArray) {
                return {name: "keyValue", value: quaternionArray, type: "KeyValueForOrientationInterpolator"};
            },
        peg$c12 = function(name, n) {
                n.name = name;
                n.isDefinition = true;
                // store node for later re-use
                nodeDefinitions[name] = n;
                n.type = "nodeDefinition"
                return n;
            },
        peg$c13 = function(t, pp) {
        		var n = {node: t};

        		// node properties are in pp, if pp is not an Inline node, if pp is an inline node, it should be read from the url
        		for (var i=0; i < pp.length; i++) {
        			var p = pp[i];

        			// is p a node?
        			if (undefined !== p.node) {
        				//console.log(p.node + ' node found');

                        // are we processing a Switch node?
                        if ('Switch' === n.node) {

                            // if the switch does not already have choice, create choice here
                            if (undefined === n.choice) {
                                n.choice = [];
                            }

                            n.choice.push(p);
                        } else {
                            // not a Switch, some other node, which has children.

                            // if the node does not already have children, create children here
                            if (undefined === n.children) {
                                n.children = [];
                            }

                            // @todo for an Inline node, we could use the parser (named 'parser') and fs here, to fetch the inline file and parse it
                            // on the other hand, it could be left up to the renderers what to do with the inline node.
                            /*
                            @see http://pegjs.org/documentation#grammar-syntax-and-semantics
                            The code inside the predicate can also access the parser object using the parser variable and options passed to the parser using the options variable.
                            */
                            n.children.push(p);
        				}

        			} else if (undefined !== p.name) {
        				// p is a property
        				n[p.name] = p.value;

        				if (undefined !== p.comment) {
        					if (undefined === n.comments) { n.comments = {}; }
        					if (undefined === n.comments[p.name]) { n.comments[p.name] = []; }
        					n.comments[p.name].push(p.comment);
        				}
        			} else if (undefined !== p.src) {
        			    // p is a route
        			    // move it to global scope
        			    routes.push(p);
        			} else {
        				// p is a comment
        				if (undefined === n.nodeComments) {
                            n.nodeComments = [];
                        }
                        n.nodeComments.push(p);
        			}
        		}

        		return n;
        	},
        peg$c14 = "orientation",
        peg$c15 = { type: "literal", value: "orientation", description: "\"orientation\"" },
        peg$c16 = "rotation",
        peg$c17 = { type: "literal", value: "rotation", description: "\"rotation\"" },
        peg$c18 = "scaleOrientation",
        peg$c19 = { type: "literal", value: "scaleOrientation", description: "\"scaleOrientation\"" },
        peg$c20 = function(name, q) { return {name: name, value: q} },
        peg$c21 = " ",
        peg$c22 = { type: "literal", value: " ", description: "\" \"" },
        peg$c23 = function(x, y, z, radians) { return {x: x, y: y, z: z, radians: radians} },
        peg$c24 = "coordIndex",
        peg$c25 = { type: "literal", value: "coordIndex", description: "\"coordIndex\"" },
        peg$c26 = function(face, lastFace) {
            	if (null !== lastFace) {
            		face.push(lastFace);
                }
                return {name: "coordIndex", value: face};
            },
        peg$c27 = "point",
        peg$c28 = { type: "literal", value: "point", description: "\"point\"" },
        peg$c29 = "vector",
        peg$c30 = { type: "literal", value: "vector", description: "\"vector\"" },
        peg$c31 = function(name, pointArray) {
                return {name: name, value: pointArray};
            },
        peg$c32 = function(name, value, comment) {
                var p = { name:name, value:value };

                // you could change a color property here by returning r g b instead of x y z

                if (null !== comment) {
                    p.comment = comment;
                }
                return p;
            },
        peg$c33 = { type: "other", description: "identifier" },
        peg$c34 = /^[^0-9\-+ '"#,.[\]{}\r\n\t]/,
        peg$c35 = { type: "class", value: "[^0-9\\-\\+ '\"#\\,\\.\\[\\]\\{\\}\\r\\n\\t]", description: "[^0-9\\-\\+ '\"#\\,\\.\\[\\]\\{\\}\\r\\n\\t]" },
        peg$c36 = /^[^ '"#,.[\]{}\r\n\t]/,
        peg$c37 = { type: "class", value: "[^ '\"#\\,\\.\\[\\]\\{\\}\\r\\n\\t]", description: "[^ '\"#\\,\\.\\[\\]\\{\\}\\r\\n\\t]" },
        peg$c38 = function(o, p) { return o + p.join('').trim(); },
        peg$c39 = { type: "other", description: "array" },
        peg$c40 = function(v) { return v; },
        peg$c41 = function(it) {
                var a = [];
                for (var i=0; i < it.length; i++) {
                    var value = it[i];

                    if (undefined !== value.src) {
                        // value is a route, add to global routes
                        routes.push(value);
                    } else if (undefined !== value.comment) {
                        // value is a comment
                        if (undefined === a.comments) {
                            a.comments = [];
                        }

                        a.comments.push(value);
                    } else {
                        // this is what we are looking for: a value for in our array!
                        a.push(value);
                    }
                }

                return a;
            },
        peg$c42 = { type: "other", description: "value" },
        peg$c43 = "false",
        peg$c44 = { type: "literal", value: "false", description: "\"false\"" },
        peg$c45 = "FALSE",
        peg$c46 = { type: "literal", value: "FALSE", description: "\"FALSE\"" },
        peg$c47 = function() { return false; },
        peg$c48 = "null",
        peg$c49 = { type: "literal", value: "null", description: "\"null\"" },
        peg$c50 = "NULL",
        peg$c51 = { type: "literal", value: "NULL", description: "\"NULL\"" },
        peg$c52 = function() { return null;  },
        peg$c53 = "true",
        peg$c54 = { type: "literal", value: "true", description: "\"true\"" },
        peg$c55 = "TRUE",
        peg$c56 = { type: "literal", value: "TRUE", description: "\"TRUE\"" },
        peg$c57 = function() { return true;  },
        peg$c58 = { type: "other", description: "number" },
        peg$c59 = function() { return parseFloat(text()); },
        peg$c60 = ".",
        peg$c61 = { type: "literal", value: ".", description: "\".\"" },
        peg$c62 = /^[1-9]/,
        peg$c63 = { type: "class", value: "[1-9]", description: "[1-9]" },
        peg$c64 = /^[eE]/,
        peg$c65 = { type: "class", value: "[eE]", description: "[eE]" },
        peg$c66 = function(s, c) {return s + c;},
        peg$c67 = function(i) {return i.join('');},
        peg$c68 = "-",
        peg$c69 = { type: "literal", value: "-", description: "\"-\"" },
        peg$c70 = "+",
        peg$c71 = { type: "literal", value: "+", description: "\"+\"" },
        peg$c72 = "0",
        peg$c73 = { type: "literal", value: "0", description: "\"0\"" },
        peg$c74 = "#",
        peg$c75 = { type: "literal", value: "#", description: "\"#\"" },
        peg$c76 = /^[^\n]/,
        peg$c77 = { type: "class", value: "[^\\n]", description: "[^\\n]" },
        peg$c78 = function(text) { return { comment: text.join('').trim() }; },
        peg$c79 = "ROUTE",
        peg$c80 = { type: "literal", value: "ROUTE", description: "\"ROUTE\"" },
        peg$c81 = "TO",
        peg$c82 = { type: "literal", value: "TO", description: "\"TO\"" },
        peg$c83 = function(src, target) {
        	    // create an index that is the name of the source node, for later retrieval of the route by name of the source
        	    var index = src.name;
        	    var route = { source: src, target: target };
        	    // put it in the global routes collection
        	    if ('undefined' === typeof routes[index]) {
        	        routes[index] = [];
        	    }
        	    routes[index].push(route);
        	    return route;
        	},
        peg$c84 = function(name, property) { return { name: name, property: property }; },
        peg$c85 = "[",
        peg$c86 = { type: "literal", value: "[", description: "\"[\"" },
        peg$c87 = "]",
        peg$c88 = { type: "literal", value: "]", description: "\"]\"" },
        peg$c89 = "{",
        peg$c90 = { type: "literal", value: "{", description: "\"{\"" },
        peg$c91 = "}",
        peg$c92 = { type: "literal", value: "}", description: "\"}\"" },
        peg$c93 = ",",
        peg$c94 = { type: "literal", value: ",", description: "\",\"" },
        peg$c95 = { type: "other", description: "whitespace" },
        peg$c96 = /^[ \t\n\r]/,
        peg$c97 = { type: "class", value: "[ \\t\\n\\r]", description: "[ \\t\\n\\r]" },
        peg$c98 = function(ws) { return ws.join('');},
        peg$c99 = function(p) { return p; },
        peg$c100 = function(x, y, z) { return {x:x, y:y, z:z}; },
        peg$c101 = function(x, y) { return {x:x, y:y}; },
        peg$c102 = "DEF",
        peg$c103 = { type: "literal", value: "DEF", description: "\"DEF\"" },
        peg$c104 = function() { return true; },
        peg$c105 = function(name) {
        	    var obj = nodeDefinitions[name];

        	    if (undefined === obj) {
        	        console.log(name + ' not found in nodeDefinitions');
        	        return obj; // undefined obj
        	    }

        	    if ('function' === typeof obj.clone) {
        	        return obj.clone();
        	    }

        	    return obj;
        	},
        peg$c106 = "USE",
        peg$c107 = { type: "literal", value: "USE", description: "\"USE\"" },
        peg$c108 = "-1",
        peg$c109 = { type: "literal", value: "-1", description: "\"-1\"" },
        peg$c110 = function(points) { return points; },
        peg$c111 = function(i) { return i },
        peg$c112 = function(uri) { return uri; },
        peg$c113 = /^[^"]/,
        peg$c114 = { type: "class", value: "[^\"]", description: "[^\"]" },
        peg$c115 = "jpg",
        peg$c116 = { type: "literal", value: "jpg", description: "\"jpg\"" },
        peg$c117 = "jpeg",
        peg$c118 = { type: "literal", value: "jpeg", description: "\"jpeg\"" },
        peg$c119 = "gif",
        peg$c120 = { type: "literal", value: "gif", description: "\"gif\"" },
        peg$c121 = "wrl",
        peg$c122 = { type: "literal", value: "wrl", description: "\"wrl\"" },
        peg$c123 = function(i, dot, ext) { return i + dot + ext; },
        peg$c124 = function(s) { return  s.join(''); },
        peg$c125 = "\"",
        peg$c126 = { type: "literal", value: "\"", description: "\"\\\"\"" },
        peg$c127 = /^[0-9]/,
        peg$c128 = { type: "class", value: "[0-9]", description: "[0-9]" },
        peg$c129 = /^[0-9a-f]/i,
        peg$c130 = { type: "class", value: "[0-9a-f]i", description: "[0-9a-f]i" },

        peg$currPos          = 0,
        peg$savedPos         = 0,
        peg$posDetailsCache  = [{ line: 1, column: 1, seenCR: false }],
        peg$maxFailPos       = 0,
        peg$maxFailExpected  = [],
        peg$silentFails      = 0,

        peg$result;

    if ("startRule" in options) {
      if (!(options.startRule in peg$startRuleFunctions)) {
        throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
      }

      peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
    }

    function text() {
      return input.substring(peg$savedPos, peg$currPos);
    }

    function location() {
      return peg$computeLocation(peg$savedPos, peg$currPos);
    }

    function expected(description) {
      throw peg$buildException(
        null,
        [{ type: "other", description: description }],
        input.substring(peg$savedPos, peg$currPos),
        peg$computeLocation(peg$savedPos, peg$currPos)
      );
    }

    function error(message) {
      throw peg$buildException(
        message,
        null,
        input.substring(peg$savedPos, peg$currPos),
        peg$computeLocation(peg$savedPos, peg$currPos)
      );
    }

    function peg$computePosDetails(pos) {
      var details = peg$posDetailsCache[pos],
          p, ch;

      if (details) {
        return details;
      } else {
        p = pos - 1;
        while (!peg$posDetailsCache[p]) {
          p--;
        }

        details = peg$posDetailsCache[p];
        details = {
          line:   details.line,
          column: details.column,
          seenCR: details.seenCR
        };

        while (p < pos) {
          ch = input.charAt(p);
          if (ch === "\n") {
            if (!details.seenCR) { details.line++; }
            details.column = 1;
            details.seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            details.line++;
            details.column = 1;
            details.seenCR = true;
          } else {
            details.column++;
            details.seenCR = false;
          }

          p++;
        }

        peg$posDetailsCache[pos] = details;
        return details;
      }
    }

    function peg$computeLocation(startPos, endPos) {
      var startPosDetails = peg$computePosDetails(startPos),
          endPosDetails   = peg$computePosDetails(endPos);

      return {
        start: {
          offset: startPos,
          line:   startPosDetails.line,
          column: startPosDetails.column
        },
        end: {
          offset: endPos,
          line:   endPosDetails.line,
          column: endPosDetails.column
        }
      };
    }

    function peg$fail(expected) {
      if (peg$currPos < peg$maxFailPos) { return; }

      if (peg$currPos > peg$maxFailPos) {
        peg$maxFailPos = peg$currPos;
        peg$maxFailExpected = [];
      }

      peg$maxFailExpected.push(expected);
    }

    function peg$buildException(message, expected, found, location) {
      function cleanupExpected(expected) {
        var i = 1;

        expected.sort(function(a, b) {
          if (a.description < b.description) {
            return -1;
          } else if (a.description > b.description) {
            return 1;
          } else {
            return 0;
          }
        });

        while (i < expected.length) {
          if (expected[i - 1] === expected[i]) {
            expected.splice(i, 1);
          } else {
            i++;
          }
        }
      }

      function buildMessage(expected, found) {
        function stringEscape(s) {
          function hex(ch) { return ch.charCodeAt(0).toString(16).toUpperCase(); }

          return s
            .replace(/\\/g,   '\\\\')
            .replace(/"/g,    '\\"')
            .replace(/\x08/g, '\\b')
            .replace(/\t/g,   '\\t')
            .replace(/\n/g,   '\\n')
            .replace(/\f/g,   '\\f')
            .replace(/\r/g,   '\\r')
            .replace(/[\x00-\x07\x0B\x0E\x0F]/g, function(ch) { return '\\x0' + hex(ch); })
            .replace(/[\x10-\x1F\x80-\xFF]/g,    function(ch) { return '\\x'  + hex(ch); })
            .replace(/[\u0100-\u0FFF]/g,         function(ch) { return '\\u0' + hex(ch); })
            .replace(/[\u1000-\uFFFF]/g,         function(ch) { return '\\u'  + hex(ch); });
        }

        var expectedDescs = new Array(expected.length),
            expectedDesc, foundDesc, i;

        for (i = 0; i < expected.length; i++) {
          expectedDescs[i] = expected[i].description;
        }

        expectedDesc = expected.length > 1
          ? expectedDescs.slice(0, -1).join(", ")
              + " or "
              + expectedDescs[expected.length - 1]
          : expectedDescs[0];

        foundDesc = found ? "\"" + stringEscape(found) + "\"" : "end of input";

        return "Expected " + expectedDesc + " but " + foundDesc + " found.";
      }

      if (expected !== null) {
        cleanupExpected(expected);
      }

      return new peg$SyntaxError(
        message !== null ? message : buildMessage(expected, found),
        expected,
        found,
        location
      );
    }

    function peg$parsevrml() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 15) === peg$c0) {
        s1 = peg$c0;
        peg$currPos += 15;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c1); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseOrientationInterpolator();
        if (s3 === peg$FAILED) {
          s3 = peg$parsenodeDefinition();
          if (s3 === peg$FAILED) {
            s3 = peg$parsenode();
            if (s3 === peg$FAILED) {
              s3 = peg$parsecomment();
              if (s3 === peg$FAILED) {
                s3 = peg$parseroute();
              }
            }
          }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseOrientationInterpolator();
          if (s3 === peg$FAILED) {
            s3 = peg$parsenodeDefinition();
            if (s3 === peg$FAILED) {
              s3 = peg$parsenode();
              if (s3 === peg$FAILED) {
                s3 = peg$parsecomment();
                if (s3 === peg$FAILED) {
                  s3 = peg$parseroute();
                }
              }
            }
          }
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c2(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseOrientationInterpolator() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$currPos;
      s2 = peg$parsedef();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsews();
        if (s3 !== peg$FAILED) {
          s4 = peg$parseidentifier();
          if (s4 !== peg$FAILED) {
            s5 = peg$parsews();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s1;
              s2 = peg$c3(s4);
              s1 = s2;
            } else {
              peg$currPos = s1;
              s1 = peg$FAILED;
            }
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        if (input.substr(peg$currPos, 23) === peg$c4) {
          s2 = peg$c4;
          peg$currPos += 23;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c5); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsebegin_node();
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseKeyValueForOrientationInterpolator();
            if (s5 === peg$FAILED) {
              s5 = peg$parseproperty();
            }
            if (s5 !== peg$FAILED) {
              while (s5 !== peg$FAILED) {
                s4.push(s5);
                s5 = peg$parseKeyValueForOrientationInterpolator();
                if (s5 === peg$FAILED) {
                  s5 = peg$parseproperty();
                }
              }
            } else {
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseend_node();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c6(s1, s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseKeyValueForOrientationInterpolator() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        if (input.substr(peg$currPos, 8) === peg$c7) {
          s2 = peg$c7;
          peg$currPos += 8;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c8); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsebegin_array();
          if (s3 !== peg$FAILED) {
            s4 = peg$currPos;
            s5 = [];
            s6 = peg$currPos;
            s7 = peg$parsequaternion();
            if (s7 !== peg$FAILED) {
              s8 = peg$parsevalue_separator();
              if (s8 !== peg$FAILED) {
                s9 = peg$parsecomment();
                if (s9 === peg$FAILED) {
                  s9 = null;
                }
                if (s9 !== peg$FAILED) {
                  peg$savedPos = s6;
                  s7 = peg$c9(s7);
                  s6 = s7;
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$currPos;
              s7 = peg$parsequaternion();
              if (s7 !== peg$FAILED) {
                s8 = peg$parsevalue_separator();
                if (s8 !== peg$FAILED) {
                  s9 = peg$parsecomment();
                  if (s9 === peg$FAILED) {
                    s9 = null;
                  }
                  if (s9 !== peg$FAILED) {
                    peg$savedPos = s6;
                    s7 = peg$c9(s7);
                    s6 = s7;
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parsequaternion();
              if (s6 === peg$FAILED) {
                s6 = null;
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parsecomment();
                if (s7 === peg$FAILED) {
                  s7 = null;
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s4;
                  s5 = peg$c10(s5, s6);
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseend_array();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c11(s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsenodeDefinition() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsedef();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseidentifier();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsews();
              if (s5 !== peg$FAILED) {
                s6 = peg$parsenode();
                if (s6 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c12(s4, s6);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsenode() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseidentifier();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsebegin_node();
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parsenodeDefinition();
            if (s5 === peg$FAILED) {
              s5 = peg$parseroute();
              if (s5 === peg$FAILED) {
                s5 = peg$parseproperty();
                if (s5 === peg$FAILED) {
                  s5 = peg$parsenode();
                  if (s5 === peg$FAILED) {
                    s5 = peg$parsecomment();
                  }
                }
              }
            }
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parsenodeDefinition();
              if (s5 === peg$FAILED) {
                s5 = peg$parseroute();
                if (s5 === peg$FAILED) {
                  s5 = peg$parseproperty();
                  if (s5 === peg$FAILED) {
                    s5 = peg$parsenode();
                    if (s5 === peg$FAILED) {
                      s5 = peg$parsecomment();
                    }
                  }
                }
              }
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseend_node();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c13(s2, s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseproperty() {
      var s0;

      s0 = peg$parseorientation();
      if (s0 === peg$FAILED) {
        s0 = peg$parsecoordIndex();
        if (s0 === peg$FAILED) {
          s0 = peg$parsepointArray();
          if (s0 === peg$FAILED) {
            s0 = peg$parsegeneric_property();
          }
        }
      }

      return s0;
    }

    function peg$parseorientation() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        if (input.substr(peg$currPos, 11) === peg$c14) {
          s2 = peg$c14;
          peg$currPos += 11;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c15); }
        }
        if (s2 === peg$FAILED) {
          if (input.substr(peg$currPos, 8) === peg$c16) {
            s2 = peg$c16;
            peg$currPos += 8;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c17); }
          }
          if (s2 === peg$FAILED) {
            if (input.substr(peg$currPos, 16) === peg$c18) {
              s2 = peg$c18;
              peg$currPos += 16;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c19); }
            }
          }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsequaternion();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c20(s2, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsequaternion() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsenumber();
        if (s2 !== peg$FAILED) {
          s3 = [];
          if (input.charCodeAt(peg$currPos) === 32) {
            s4 = peg$c21;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c22); }
          }
          if (s4 !== peg$FAILED) {
            while (s4 !== peg$FAILED) {
              s3.push(s4);
              if (input.charCodeAt(peg$currPos) === 32) {
                s4 = peg$c21;
                peg$currPos++;
              } else {
                s4 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c22); }
              }
            }
          } else {
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsenumber();
            if (s4 !== peg$FAILED) {
              s5 = [];
              if (input.charCodeAt(peg$currPos) === 32) {
                s6 = peg$c21;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c22); }
              }
              if (s6 !== peg$FAILED) {
                while (s6 !== peg$FAILED) {
                  s5.push(s6);
                  if (input.charCodeAt(peg$currPos) === 32) {
                    s6 = peg$c21;
                    peg$currPos++;
                  } else {
                    s6 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                  }
                }
              } else {
                s5 = peg$FAILED;
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parsenumber();
                if (s6 !== peg$FAILED) {
                  s7 = [];
                  if (input.charCodeAt(peg$currPos) === 32) {
                    s8 = peg$c21;
                    peg$currPos++;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                  }
                  if (s8 !== peg$FAILED) {
                    while (s8 !== peg$FAILED) {
                      s7.push(s8);
                      if (input.charCodeAt(peg$currPos) === 32) {
                        s8 = peg$c21;
                        peg$currPos++;
                      } else {
                        s8 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                      }
                    }
                  } else {
                    s7 = peg$FAILED;
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parsenumber();
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parsews();
                      if (s9 === peg$FAILED) {
                        s9 = null;
                      }
                      if (s9 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c23(s2, s4, s6, s8);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsecoordIndex() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 10) === peg$c24) {
        s1 = peg$c24;
        peg$currPos += 10;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c25); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsews();
        if (s2 === peg$FAILED) {
          s2 = null;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsebegin_array();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsecomment();
            if (s4 === peg$FAILED) {
              s4 = null;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parsews();
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseface();
                if (s7 !== peg$FAILED) {
                  while (s7 !== peg$FAILED) {
                    s6.push(s7);
                    s7 = peg$parseface();
                  }
                } else {
                  s6 = peg$FAILED;
                }
                if (s6 !== peg$FAILED) {
                  s7 = peg$parselastFace();
                  if (s7 === peg$FAILED) {
                    s7 = null;
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parsews();
                    if (s8 === peg$FAILED) {
                      s8 = null;
                    }
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parsecomment();
                      if (s9 === peg$FAILED) {
                        s9 = null;
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parseend_array();
                        if (s10 !== peg$FAILED) {
                          s11 = peg$parsews();
                          if (s11 === peg$FAILED) {
                            s11 = null;
                          }
                          if (s11 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c26(s6, s7);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsepointArray() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 5) === peg$c27) {
        s1 = peg$c27;
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c28); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 6) === peg$c29) {
          s1 = peg$c29;
          peg$currPos += 6;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c30); }
        }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsews();
        if (s2 === peg$FAILED) {
          s2 = null;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsebegin_array();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsecomment();
            if (s4 === peg$FAILED) {
              s4 = null;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parsews();
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parsepoint();
                if (s7 !== peg$FAILED) {
                  while (s7 !== peg$FAILED) {
                    s6.push(s7);
                    s7 = peg$parsepoint();
                  }
                } else {
                  s6 = peg$FAILED;
                }
                if (s6 !== peg$FAILED) {
                  s7 = peg$parsecomment();
                  if (s7 === peg$FAILED) {
                    s7 = null;
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parseend_array();
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parsews();
                      if (s9 === peg$FAILED) {
                        s9 = null;
                      }
                      if (s9 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c31(s1, s6);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsegeneric_property() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseidentifier();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsevalue();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsews();
              if (s5 !== peg$FAILED) {
                s6 = peg$parsecomment();
                if (s6 === peg$FAILED) {
                  s6 = null;
                }
                if (s6 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c32(s2, s4, s6);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseidentifier() {
      var s0, s1, s2, s3;

      peg$silentFails++;
      s0 = peg$currPos;
      if (peg$c34.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c35); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        if (peg$c36.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c37); }
        }
        if (s3 !== peg$FAILED) {
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            if (peg$c36.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c37); }
            }
          }
        } else {
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c38(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c33); }
      }

      return s0;
    }

    function peg$parsearray() {
      var s0, s1, s2, s3, s4, s5, s6;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parsebegin_array();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parsecomment();
        if (s3 === peg$FAILED) {
          s3 = peg$parseroute();
          if (s3 === peg$FAILED) {
            s3 = peg$currPos;
            s4 = peg$parsevalue();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsews();
              if (s5 !== peg$FAILED) {
                s6 = peg$parsevalue_separator();
                if (s6 === peg$FAILED) {
                  s6 = null;
                }
                if (s6 !== peg$FAILED) {
                  peg$savedPos = s3;
                  s4 = peg$c40(s4);
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parsecomment();
          if (s3 === peg$FAILED) {
            s3 = peg$parseroute();
            if (s3 === peg$FAILED) {
              s3 = peg$currPos;
              s4 = peg$parsevalue();
              if (s4 !== peg$FAILED) {
                s5 = peg$parsews();
                if (s5 !== peg$FAILED) {
                  s6 = peg$parsevalue_separator();
                  if (s6 === peg$FAILED) {
                    s6 = null;
                  }
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s3;
                    s4 = peg$c40(s4);
                    s3 = s4;
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            }
          }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseend_array();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c41(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c39); }
      }

      return s0;
    }

    function peg$parsevalue() {
      var s0, s1;

      peg$silentFails++;
      s0 = peg$parsefalse();
      if (s0 === peg$FAILED) {
        s0 = peg$parsepoints();
        if (s0 === peg$FAILED) {
          s0 = peg$parseOrientationInterpolator();
          if (s0 === peg$FAILED) {
            s0 = peg$parseface();
            if (s0 === peg$FAILED) {
              s0 = peg$parsenull();
              if (s0 === peg$FAILED) {
                s0 = peg$parsetrue();
                if (s0 === peg$FAILED) {
                  s0 = peg$parsenodeDefinition();
                  if (s0 === peg$FAILED) {
                    s0 = peg$parsenode();
                    if (s0 === peg$FAILED) {
                      s0 = peg$parsepoint();
                      if (s0 === peg$FAILED) {
                        s0 = peg$parsepointArray();
                        if (s0 === peg$FAILED) {
                          s0 = peg$parsevector();
                          if (s0 === peg$FAILED) {
                            s0 = peg$parsevector2();
                            if (s0 === peg$FAILED) {
                              s0 = peg$parseuse_statement();
                              if (s0 === peg$FAILED) {
                                s0 = peg$parsearray();
                                if (s0 === peg$FAILED) {
                                  s0 = peg$parsenumber();
                                  if (s0 === peg$FAILED) {
                                    s0 = peg$parseidentifier();
                                    if (s0 === peg$FAILED) {
                                      s0 = peg$parseurl();
                                      if (s0 === peg$FAILED) {
                                        s0 = peg$parsequoted_string();
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c42); }
      }

      return s0;
    }

    function peg$parsefalse() {
      var s0, s1;

      if (input.substr(peg$currPos, 5) === peg$c43) {
        s0 = peg$c43;
        peg$currPos += 5;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c44); }
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 5) === peg$c45) {
          s1 = peg$c45;
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c46); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c47();
        }
        s0 = s1;
      }

      return s0;
    }

    function peg$parsenull() {
      var s0, s1;

      if (input.substr(peg$currPos, 4) === peg$c48) {
        s0 = peg$c48;
        peg$currPos += 4;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c49); }
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 4) === peg$c50) {
          s1 = peg$c50;
          peg$currPos += 4;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c51); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c52();
        }
        s0 = s1;
      }

      return s0;
    }

    function peg$parsetrue() {
      var s0, s1;

      if (input.substr(peg$currPos, 4) === peg$c53) {
        s0 = peg$c53;
        peg$currPos += 4;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c54); }
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 4) === peg$c55) {
          s1 = peg$c55;
          peg$currPos += 4;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c56); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c57();
        }
        s0 = s1;
      }

      return s0;
    }

    function peg$parsenumber() {
      var s0, s1, s2, s3, s4;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = peg$parseminus();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        s3 = peg$parseint();
        if (s3 !== peg$FAILED) {
          s4 = peg$parsefrac();
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            s3 = [s3, s4];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 === peg$FAILED) {
          s2 = peg$parsefrac();
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseexp();
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c59();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c58); }
      }

      return s0;
    }

    function peg$parsedecimal_point() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 46) {
        s0 = peg$c60;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c61); }
      }

      return s0;
    }

    function peg$parsedigit1_9() {
      var s0;

      if (peg$c62.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c63); }
      }

      return s0;
    }

    function peg$parsee() {
      var s0;

      if (peg$c64.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c65); }
      }

      return s0;
    }

    function peg$parseexp() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$parsee();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseminus();
        if (s2 === peg$FAILED) {
          s2 = peg$parseplus();
        }
        if (s2 === peg$FAILED) {
          s2 = null;
        }
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseDIGIT();
          if (s4 !== peg$FAILED) {
            while (s4 !== peg$FAILED) {
              s3.push(s4);
              s4 = peg$parseDIGIT();
            }
          } else {
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsefrac() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsedecimal_point();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseDIGIT();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseDIGIT();
        }
        if (s2 !== peg$FAILED) {
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseint() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = peg$parseint_start();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseint_continued();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c66(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseint_start() {
      var s0;

      s0 = peg$parsezero();
      if (s0 === peg$FAILED) {
        s0 = peg$parsedigit1_9();
      }

      return s0;
    }

    function peg$parseint_continued() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseDIGIT();
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$parseDIGIT();
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c67(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseminus() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 45) {
        s0 = peg$c68;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c69); }
      }

      return s0;
    }

    function peg$parseplus() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 43) {
        s0 = peg$c70;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c71); }
      }

      return s0;
    }

    function peg$parsezero() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 48) {
        s0 = peg$c72;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c73); }
      }

      return s0;
    }

    function peg$parsecomment() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 35) {
          s2 = peg$c74;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c75); }
        }
        if (s2 !== peg$FAILED) {
          s3 = [];
          if (peg$c76.test(input.charAt(peg$currPos))) {
            s4 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c77); }
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            if (peg$c76.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c77); }
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsews();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c78(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseroute() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 !== peg$FAILED) {
        if (input.substr(peg$currPos, 5) === peg$c79) {
          s2 = peg$c79;
          peg$currPos += 5;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c80); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseroute_part();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsews();
              if (s5 !== peg$FAILED) {
                if (input.substr(peg$currPos, 2) === peg$c81) {
                  s6 = peg$c81;
                  peg$currPos += 2;
                } else {
                  s6 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c82); }
                }
                if (s6 !== peg$FAILED) {
                  s7 = peg$parsews();
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parseroute_part();
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parsews();
                      if (s9 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c83(s4, s8);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseroute_part() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parseidentifier();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s2 = peg$c60;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c61); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseidentifier();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c84(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsebegin_array() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 91) {
          s2 = peg$c85;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c86); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseend_array() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 93) {
          s2 = peg$c87;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c88); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsebegin_node() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 123) {
          s2 = peg$c89;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c90); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseend_node() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 125) {
          s2 = peg$c91;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c92); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsevalue_separator() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 44) {
          s2 = peg$c93;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c94); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsews() {
      var s0, s1, s2;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = [];
      if (peg$c96.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c97); }
      }
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c96.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c97); }
        }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c98(s1);
      }
      s0 = s1;
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c95); }
      }

      return s0;
    }

    function peg$parsespace() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 32) {
        s0 = peg$c21;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c22); }
      }

      return s0;
    }

    function peg$parsepoint() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$parsevector();
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 44) {
          s2 = peg$c93;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c94); }
        }
        if (s2 === peg$FAILED) {
          s2 = null;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsecomment();
            if (s4 === peg$FAILED) {
              s4 = null;
            }
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c99(s1);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsepoints() {
      var s0;

      s0 = peg$parsepoint();
      if (s0 === peg$FAILED) {
        s0 = peg$parsecomment();
      }

      return s0;
    }

    function peg$parsevector() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsenumber();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsenumber();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsews();
              if (s5 !== peg$FAILED) {
                s6 = peg$parsenumber();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parsews();
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parsecomment();
                    if (s8 === peg$FAILED) {
                      s8 = null;
                    }
                    if (s8 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c100(s2, s4, s6);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsevector2() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsenumber();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsenumber();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsews();
              if (s5 !== peg$FAILED) {
                s6 = peg$parsecomment();
                if (s6 === peg$FAILED) {
                  s6 = null;
                }
                if (s6 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c101(s2, s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsedef() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c102) {
          s2 = peg$c102;
          peg$currPos += 3;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c103); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c104();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseuse_statement() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 !== peg$FAILED) {
        s2 = peg$parseuse();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            s4 = peg$parseidentifier();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c105(s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseuse() {
      var s0, s1;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3) === peg$c106) {
        s1 = peg$c106;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c107); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c104();
      }
      s0 = s1;

      return s0;
    }

    function peg$parseface() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseindex();
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$parseindex();
        }
      } else {
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c108) {
          s2 = peg$c108;
          peg$currPos += 2;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c109); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 44) {
              s4 = peg$c93;
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c94); }
            }
            if (s4 === peg$FAILED) {
              s4 = null;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parsews();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c110(s1);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parselastFace() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseindex();
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$parseindex();
        }
      } else {
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsews();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 44) {
            s3 = peg$c93;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c94); }
          }
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsews();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c110(s1);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseindex() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parseint();
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        s3 = peg$parsews();
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 44) {
            s4 = peg$c93;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c94); }
          }
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 32) {
              s5 = peg$c21;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c22); }
            }
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            if (s5 !== peg$FAILED) {
              s3 = [s3, s4, s5];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 === peg$FAILED) {
          s2 = [];
          if (input.charCodeAt(peg$currPos) === 32) {
            s3 = peg$c21;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c22); }
          }
          if (s3 !== peg$FAILED) {
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              if (input.charCodeAt(peg$currPos) === 32) {
                s3 = peg$c21;
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c22); }
              }
            }
          } else {
            s2 = peg$FAILED;
          }
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c111(s1);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseurl() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsebegin_array();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsequote();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseuri();
              if (s5 !== peg$FAILED) {
                s6 = peg$parsequote();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parsews();
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parseend_array();
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parsews();
                      if (s9 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c112(s5);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parseuri() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = [];
      if (peg$c113.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c114); }
      }
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c113.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c114); }
        }
      }
      if (s1 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s2 = peg$c60;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c61); }
        }
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c115) {
            s3 = peg$c115;
            peg$currPos += 3;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c116); }
          }
          if (s3 === peg$FAILED) {
            if (input.substr(peg$currPos, 4) === peg$c117) {
              s3 = peg$c117;
              peg$currPos += 4;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c118); }
            }
            if (s3 === peg$FAILED) {
              if (input.substr(peg$currPos, 3) === peg$c119) {
                s3 = peg$c119;
                peg$currPos += 3;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c120); }
              }
              if (s3 === peg$FAILED) {
                if (input.substr(peg$currPos, 3) === peg$c121) {
                  s3 = peg$c121;
                  peg$currPos += 3;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c122); }
                }
              }
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c123(s1, s2, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsequoted_string() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsequote();
        if (s2 !== peg$FAILED) {
          s3 = [];
          if (peg$c113.test(input.charAt(peg$currPos))) {
            s4 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c114); }
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            if (peg$c113.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c114); }
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsequote();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsews();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c124(s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsequote() {
      var s0;

      if (input.charCodeAt(peg$currPos) === 34) {
        s0 = peg$c125;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c126); }
      }

      return s0;
    }

    function peg$parseDIGIT() {
      var s0;

      if (peg$c127.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c128); }
      }

      return s0;
    }

    function peg$parseHEXDIG() {
      var s0;

      if (peg$c129.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c130); }
      }

      return s0;
    }


    	var nodeDefinitions = {};
    	var routes = {};


    peg$result = peg$startRuleFunction();

    if (peg$result !== peg$FAILED && peg$currPos === input.length) {
      return peg$result;
    } else {
      if (peg$result !== peg$FAILED && peg$currPos < input.length) {
        peg$fail({ type: "end", description: "end of input" });
      }

      throw peg$buildException(
        null,
        peg$maxFailExpected,
        peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
        peg$maxFailPos < input.length
          ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
          : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
      );
    }
  }

  return {
    SyntaxError: peg$SyntaxError,
    parse:       peg$parse
  };
})();

export {VRMLLoader};