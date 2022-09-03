/********************************************************************************
 * Lightweight helper for fast and direct manipulation of pixels in Javascript.
 * 
 * Uses WebGL to overcome the performance overheads of GetImageData() and
 * PutImageData() in Canvas2D, enabling manipulation of large numbers of pixels
 * while maintaining a high frame rate (e.g. 60FPS).
 * 
 * @author Matthew Lynch
 * @license 
 * Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)	
 *******************************************************************************/

class PixelGL
{
	/********************************************************************************
	 * Creates a new PixelGL instance.
	 * 
	 * @param {String} canvasID the ID of the canvas to bind instance to
	 * @param {Number} width    the desired width of the output
	 * @param {Number} height   the desired height of the output
	 * 
	 *******************************************************************************/
	constructor(canvasID, width, height)
	{
		this.safe = false;
		this.initialized = false;

		// get canvas and establish WebGL context

		this.canvas = document.querySelector(`#${canvasID}`);

		if(this.canvas === null)
		{
			console.error(`Error finding canvas. \n\t Provided ID: ${canvasID}`);

			return;
		}

		this.gl = this.canvas.getContext("webgl");

		if(this.gl === null)
		{
			console.error(`Error getting WebGL context for canvas. \n\t Provided ID: ${canvasID}`);

			return;
		}

		// ensure canvas and WebGL viewport are the correct size

		this.width = width;
		this.height = height;

		this.gl.canvas.width  = this.width;
		this.gl.canvas.height = this.height;

		this.gl.viewport(0, 0, this.width, this.height);

		// build pixel data buffer

		this.pixelCount = this.width * this.height;
		this.byteCount = this.pixelCount * 4; //RGBA

		this.data = new Uint8Array(this.byteCount);

		// setup pixel texture

		this.textureLevel = 0;
		this.textureBorder = 0;
		this.textureFormat = this.gl.RGBA;
		this.textureType = this.gl.UNSIGNED_BYTE;

		this.texture = this.createEmptyTexture();

		// placeholders for WebGL shader program

		this.program = null;

		this.attribLocations = null;
		this.uniformLocations = null;

		// placeholders for performance metrics

		this.lastRenderDuration = 0;
		this.lastRenderEnded = 0;

		// mark as safe to use (everything we need is in place for initialization)

		this.safe = true;
	}

	/********************************************************************************
	 * Creates an empty WebGL texture to allow pixel data to passed to shaders.
	 * 
	 *******************************************************************************/
	createEmptyTexture()
	{
		const texture = this.gl.createTexture();

		this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

		// texture parameters - disable filtering
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

		this.gl.texImage2D(this.gl.TEXTURE_2D, this.textureLevel, this.textureFormat, this.width, this.height, this.textureBorder, this.textureFormat, this.textureType, this.data);
		
		return texture;
	}
	
	/********************************************************************************
	 * Initializes the PixelGL instance, including loading of WebGL shaders and 
	 * configuration of the WebGL context.
	 * 
	 * @param {String} vertexShaderURI    location of the vertex shader's source code
	 * @param {String} fragementShaderURI location of the fragement shader's source code
	 * 
	 *******************************************************************************/
	async initialize(vertexShaderURI, fragementShaderURI)
	{
		// create shader program

		this.program = await this.createShaderProgram(vertexShaderURI, fragementShaderURI);

		if(this.program === null)
		{
			console.error("Error creating shader program.");
			
			return null;
		}

		this.gl.useProgram(this.program);

		// get shader program memory locations

		this.attribLocations = {
			position: this.gl.getAttribLocation(this.program, "a_position"),
  			texcoord: this.gl.getAttribLocation(this.program, "a_texcoord")
		};

		this.uniformLocations = {
			matrix: this.gl.getUniformLocation(this.program, "u_matrix"),
			texture: this.gl.getUniformLocation(this.program, "u_texture")
		};

		// define the vertices of our pixel quad (rectangle made of two triangles)

		let quadVertices = [
			0, 0,
			0, 1,
			1, 0,
			1, 0,
			0, 1,
			1, 1,
		];

		// create position buffer and add quad to buffer

		this.positionBuffer = this.gl.createBuffer();
  		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(quadVertices), this.gl.STATIC_DRAW);

		// create texture coordinates buffer and add quad to buffer

		this.texcoordBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texcoordBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(quadVertices), this.gl.STATIC_DRAW);

		// provide the shader program with our position and texture coordinates buffers

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
		this.gl.enableVertexAttribArray(this.attribLocations.position);
		this.gl.vertexAttribPointer(this.attribLocations.position, 2, this.gl.FLOAT, false, 0, 0);
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texcoordBuffer);
		this.gl.enableVertexAttribArray(this.attribLocations.texcoord);
		this.gl.vertexAttribPointer(this.attribLocations.texcoord, 2, this.gl.FLOAT, false, 0, 0);

		// instruct the shader program where to find the texture
		
		this.gl.uniform1i(this.uniformLocations.texture, 0);

		// provide the shader program with a matrix to correctly position and scale our quad

		let matrix = this.createOrthographicMatrix();
			matrix = this.translateMatrix(matrix, 0, 0, 0); // correct location
			matrix = this.scaleMatrix(matrix, this.width, this.height, 1); // correct size

		this.gl.uniformMatrix4fv(this.uniformLocations.matrix, false, matrix);

		// mark as initialized (we are ready to render)

		this.initialized = true;
	}

	/********************************************************************************
	 * Creates a WebGL shader program, including loading and compiling required shaders.
	 * Used during initialization.
	 * 
	 * @param {String} vertexShaderURI    location of the vertex shader's source code
	 * @param {String} fragementShaderURI location of the fragement shader's source code
	 * 
	 *******************************************************************************/
	async createShaderProgram(vertexShaderURI, fragementShaderURI)
	{
		// load and compile shaders from provided URIs

		let shaders = await this.compileShaders(vertexShaderURI, fragementShaderURI);

		if(shaders === null)
		{
			console.error("Could not load shaders.");

			return null;
		}

		// create program

		let program = this.gl.createProgram();

		// attach shaders
		
		shaders.forEach((shader) => { this.gl.attachShader(program, shader); });

		// link program

		this.gl.linkProgram(program);

		// confirm link status
		
		let linked = this.gl.getProgramParameter(program, this.gl.LINK_STATUS);
		if (!linked)
		{
			console.error(`Error linking shader program. \n\t Info: ${this.gl.getProgramInfoLog(program)}`);

			this.gl.deleteProgram(program); // clean up

			return null;
		}

		return program;
	}

	/********************************************************************************
	 * Asynchronously loads and compiles required WebGL shaders from provided URIs.
	 * Used during initialization.
	 * 
	 * @param {String} vertexShaderURI    location of the vertex shader's source code
	 * @param {String} fragementShaderURI location of the fragement shader's source code
	 * 
	 *******************************************************************************/
	async compileShaders(vertexShaderURI, fragementShaderURI)
	{
		// load shaders from provided URIs

		let vertexShaderRequest = fetch(vertexShaderURI);
		let fragmentShaderRequest = fetch(fragementShaderURI);

		let shaderRequests = await Promise.all([vertexShaderRequest, fragmentShaderRequest]);

		for(let response of shaderRequests)
		{
			if(response.status !== 200)
			{
				console.error(`Error retrieving source for shader. \n\t URI: ${vertexShaderURI} \n\t Status: ${response.statusText} (${response.status})`);

				return null;
			}
		}

		let vertexShaderSource = await shaderRequests[0].text();
		let fragmentShaderSource = await shaderRequests[1].text();

		// compile shaders

		let vertextShader = this.compileShader(vertexShaderSource, this.gl.VERTEX_SHADER);
		let fragmentShader = this.compileShader(fragmentShaderSource, this.gl.FRAGMENT_SHADER);

		if(vertextShader === null || fragmentShader === null)
		{
			console.error("Could not compile shaders.");

			return null;
		}

		return [vertextShader, fragmentShader];
	}

	/********************************************************************************
	 * Compiles the provided WebGL shader. Used as part of initialization.
	 * 
	 * @param {String} shaderSource the source code of the shader
	 * @param {Number} shaderType   the WebGL shader type
	 * 
	 *******************************************************************************/
	compileShader(shaderSource, shaderType)
	{
		const shader = this.gl.createShader(shaderType);

		this.gl.shaderSource(shader, shaderSource);
		this.gl.compileShader(shader);

		// confirm compile status

		const compiled = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
		if (!compiled)
		{
			let shaderName = (shaderType = this.gl.VERTEX_SHADER)? "vertex shader": (shaderType = this.gl.FRAGMENT_SHADER)? "fragement shader": "unknown";

			console.error(`Error compiling shader. \n\t Shader: ${shaderName} \n\t Info: ${this.gl.getShaderInfoLog(shader)}`);

			this.gl.deleteShader(shader); // clean up

			return null;
		}

		return shader;
	}

	/********************************************************************************
	 * Creates a 4x4 orthographic matrix that ensures the scene is oriented to view
	 * the pixel quad straight on.
	 * 
	 *******************************************************************************/
	createOrthographicMatrix()
	{
		let left = 0;
		let right = this.gl.canvas.width;
		let bottom = this.gl.canvas.height;
		let top = 0;
		let near = -1;
		let far = 1;

		let out = new Float32Array(16);

		out[ 0] = 2 / (right - left);
		out[ 1] = 0;
		out[ 2] = 0;
		out[ 3] = 0;
		out[ 4] = 0;
		out[ 5] = 2 / (top - bottom);
		out[ 6] = 0;
		out[ 7] = 0;
		out[ 8] = 0;
		out[ 9] = 0;
		out[10] = 2 / (near - far);
		out[11] = 0;
		out[12] = (left + right) / (left - right);
		out[13] = (bottom + top) / (bottom - top);
		out[14] = (near + far) / (near - far);
		out[15] = 1;

		return out;
	}

	/********************************************************************************
	 * Translates (moves) the provided 4x4 matrix by the provided values.
	 * 
	 * @param {Float32Array(16)} src source matrix (4x4)
	 * @param {Number} 	         tx  the x-axis (horizontal) translation
	 * @param {Number} 	         ty  the y-axis (vertical) translation
	 * 
	 *******************************************************************************/
	translateMatrix(src, tx, ty)
	{
		let out = new Float32Array(16);

		var src00 = src[0];
		var src01 = src[1];
		var src02 = src[2];
		var src03 = src[3];
		var src10 = src[1 * 4 + 0];
		var src11 = src[1 * 4 + 1];
		var src12 = src[1 * 4 + 2];
		var src13 = src[1 * 4 + 3];
		var src20 = src[2 * 4 + 0];
		var src21 = src[2 * 4 + 1];
		var src22 = src[2 * 4 + 2];
		var src23 = src[2 * 4 + 3];
		var src30 = src[3 * 4 + 0];
		var src31 = src[3 * 4 + 1];
		var src32 = src[3 * 4 + 2];
		var src33 = src[3 * 4 + 3];

		out[ 0] = src00;
		out[ 1] = src01;
		out[ 2] = src02;
		out[ 3] = src03;
		out[ 4] = src10;
		out[ 5] = src11;
		out[ 6] = src12;
		out[ 7] = src13;
		out[ 8] = src20;
		out[ 9] = src21;
		out[10] = src22;
		out[11] = src23;

		out[12] = src00 * tx + src10 * ty + src20 + src30;
		out[13] = src01 * tx + src11 * ty + src21 + src31;
		out[14] = src02 * tx + src12 * ty + src22 + src32;
		out[15] = src03 * tx + src13 * ty + src23 + src33;

		return out;
	}

	/********************************************************************************
	 * Scales the provided 4x4 matrix by the provided values.
	 * 
	 * @param {Float32Array(16)} src source matrix (4x4)
	 * @param {Number} 	         sx  the x-axis (horizontal) scale
	 * @param {Number} 	         sy  the y-axis (vertical) scale
	 * 
	 *******************************************************************************/
	scaleMatrix(src, sx, sy)
	{
		let out = new Float32Array(16);

		out[ 0] = sx * src[0 * 4 + 0];
		out[ 1] = sx * src[0 * 4 + 1];
		out[ 2] = sx * src[0 * 4 + 2];
		out[ 3] = sx * src[0 * 4 + 3];
		out[ 4] = sy * src[1 * 4 + 0];
		out[ 5] = sy * src[1 * 4 + 1];
		out[ 6] = sy * src[1 * 4 + 2];
		out[ 7] = sy * src[1 * 4 + 3];
		out[ 8] = src[2 * 4 + 0];
		out[ 9] = src[2 * 4 + 1];
		out[10] = src[2 * 4 + 2];
		out[11] = src[2 * 4 + 3];
		out[12] = src[12];
		out[13] = src[13];
		out[14] = src[14];
		out[15] = src[15];

		return out;
	}

	/********************************************************************************
	 * (Re)binds the WebGL texture and updates the texture with the current contents
	 * of the pixel data buffer.
	 * 
	 *******************************************************************************/
	updateTexture()
	{
		this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
		this.gl.texImage2D(this.gl.TEXTURE_2D, this.textureLevel, this.textureFormat, this.width, this.height, this.textureBorder, this.textureFormat, this.textureType, this.data);
	}

	/********************************************************************************
	 * Renders the current contents of the pixel data buffer to the canvas.
	 * 
	 * Measures how long the renderer takes and stores in lastRenderDuration.
	 * Also measures the timestamp the render ended in lastRenderEnded.
	 * 
	 *******************************************************************************/
	render()
	{
		const renderBegin = performance.now();
		
		this.updateTexture(); // texture is bound during update
		this.gl.drawArrays(this.gl.TRIANGLES, 0, 6); // draw textured quad

		const renderFinish = performance.now();

		this.lastRenderDuration = renderFinish - renderBegin;
		this.lastRenderEnded = renderFinish;
	}

	/********************************************************************************
	 * Loads existing pixel data. Is compatible with the ImageData.data array from
	 * the Canvas 2D getImageData(), so long as the dimensions are compatible.
	 * 
	 * @param {Array} source existing pixel data (dimensions must match)
	 * 
	 *******************************************************************************/
	loadPixelData(source)
	{
		if(source.length != this.data.length)
		{
			console.error(`Unable to load pixel data with different dimensions.`);

			return;
		}

		for(var i = 0; i < this.data.length; i++)
		{
			this.data[i] = source[i];
		}
	}

	/********************************************************************************
	 * Sets the color of a pixel, ready for next call to render.
	 * 
	 * This call DOES NOT CHECK BOUNDARIES as such a check can add signficant
	 * overhead in certain browsers (most notably Firefox).
	 * 
	 * @param {Number} x 	 the X (horizontal) position of the pixel
	 * @param {Number} y 	 the Y (vertical) position of the pixel
	 * @param {Number} red 	 the desired red value of the pixel (0-255)
	 * @param {Number} green the desired green value of the pixel (0-255)
	 * @param {Number} blue  the desired blue value of the pixel (0-255)
	 * @param {Number} alpha the desired alpha (opaqueness) of the pixel (0-255)
	 * 
	 *******************************************************************************/
	 setPixel(x, y, red, green, blue, alpha)
	 {
		 let index = ((y * this.width) + x) * 4;
 
		 this.data[index + 0] = red;
		 this.data[index + 1] = green;
		 this.data[index + 2] = blue;
		 this.data[index + 3] = alpha;
	 }

	/********************************************************************************
	 * Gets the color of a pixel from the current pixel data buffer.
	 * 
	 * This call DOES NOT CHECK BOUNDARIES as such a check can add signficant
	 * overhead in certain browsers (most notably Firefox).
	 * 
	 * @param {Number} x 	 the X (horizontal) position of the pixel
	 * @param {Number} y 	 the Y (vertical) position of the pixel
	 * 
	 *******************************************************************************/
	 getPixel(x, y)
	 {
		 let index = ((y * this.width) + x) * 4;
 
		 let red = this.data[index + 0];
		 let green = this.data[index + 1];
		 let blue = this.data[index + 2];
		 let alpha = this.data[index + 3];

		 return {x: x, y: y, red: red, green: green, blue: blue, alpha: alpha};
	 }

}