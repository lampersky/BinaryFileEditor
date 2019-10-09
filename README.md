# BinaryFileEditor

Binary file editor, patcher

Currently functionality of this application is very limited, but you should be able to replace any gif/mp3/jpg/wav/png/bmp or text in your binary file (ie. firmware).

This app is just a prototype! Code is not clean.

https://lampersky.github.io/BinaryFileEditor/

[![BinaryFileEditor in action](https://img.youtube.com/vi/xpWef3vGuWw/0.jpg)](https://www.youtube.com/watch?v=xpWef3vGuWw)

[![Translate firmware into your language](https://img.youtube.com/vi/83EKqi7rYJY/0.jpg)](https://www.youtube.com/watch?v=83EKqi7rYJY)

This app is using DataStream.js library from:
https://github.com/kig/DataStream.js/blob/master/DataStream.js

I've only added "skip" function.

```
/**
  Skip the DataStream read/write position.

  @param {number} length Bytes to skip.
  @return {null}
  */
DataStream.prototype.skip = function(length) {
  if (this.position + length > this.byteLength || this.position + length < 0) {
	throw new Error('Out of bound!');
  }
  this.position = this.position + length;
};
```