# PixelGL
PixelGL is a lightweight WebGL wrapper that aims to eliminate this overhead and provide an alternate method of working with large quantities of pixels while maintaining a high frame rate (e.g. 60FPS).

It is offered as a simple alternative to the getImageData() and putImageData() calls of Canvas 2D, which carry significant overhead to remain compatible with the many other tools of Canvas 2D.

It is important to recognise that PixelGL is highly targeted at direct pixel manipulation and therefore lacks most of the tooling that Canvas 2D provides. PixelGL can be used to supplement a secondary canvas using Canvas 2D, but this will likely come with a performance penalty.

# Live Demonstration
A live demonstration of PixelGL is available on the author's website:

[http://matthewlynch.net/projects/PixelGL/](http://matthewlynch.net/projects/PixelGL/)

# Local Hosting & Cross-Origin Resource Sharing (CORS) Errors
PixelGL uses fetch() to load the required WebGL shaders. This will cause Cross-Origin Resource Sharing (CORS) errors if you are using PixelGL from a local filesystem.

For local hosting, it is recommended you use a lightweight web server like [Fenix](http://fenixwebserver.com/), which will allow you to avoid CORS errors with minimal overhead and setup required.

# Note On Performance
In most modern browsers, PixelGL will render hundreds of thousands of pixels in less than a milisecond and with minimal flow-on latency. But when working with large quantities of pixels, rendering is only one area where performance bottlenecks might appear.

For example, a very common test seen in the frequent manipulation of large numbers of pixels is to generate hundreds of thousands of randomly coloured pixels. What is often overlooked in these tests is that the Math.random() call in Javascript is actually quite slow in most browsers, and therefore inadvertently significant overhead that has nothing to do with the actual pixel manipulation. This is why a simpler pattern generator is used in the provided demonstration, achieving the same practical outcome, but with significantly less overhead.