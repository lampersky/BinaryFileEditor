function indexOf(outerArray, smallerArray, offset = 0) {
	for(var i = offset; i < outerArray.length - smallerArray.length+1; ++i) {
		var found = true;
		for(var j = 0; j < smallerArray.length; ++j) {
		   if (outerArray[i+j] != smallerArray[j]) {
			   found = false;
			   break;
		   }
		}
		if (found) return i;
	 }
   return -1;  
}

const arraySum = arr => arr.reduce((a,b) => a + b, 0);

function searchGIFs(file, onItemCallback, onSuccessCallback, onProgress) {
	var chunkReaderBlock = null;
	var fileSize = file.size;
	var chunkSize = 2 * 1024 * 1024;
	var offset = 0;

	var previous = undefined;

	function skipColorTable(ds, flags) {
		if (flags & 0x80)
			ds.skip(3 << ((flags & 7) + 1));
	}

	var readEventHandler = function(evt) {
		if (evt.target.error == null) {
			var arrayBuffer = this.result;
			var array;
			var acc = 0;
			
			if (previous) {
				acc += previous.length;
				array = new Uint8Array(previous.length + arrayBuffer.byteLength);
				array.set(previous, 0);
				array.set(new Uint8Array(arrayBuffer), previous.length);
			} else {
				array = new Uint8Array(arrayBuffer);
			}
			
			var gif = indexOf(array, [71,73,70,56]); //GIF89a, GIF87a
			for (;gif!=-1;gif=indexOf(array, [71,73,70,56], gif+1)) {
				var width = undefined, height = undefined;
				try {
					var ds = new DataStream(array);
					ds.skip(gif);
					ds.readString(6);
					var width = ds.readUint16();
					var height = ds.readUint16();
					var flags = ds.readUint8(1);
					ds.skip(2);
					skipColorTable(ds, flags);
					while (true) {
						var block = ds.readString(1);
						if (block == ';') break;
						if (block == '!') { ds.skip(1); }
						else if (block == ',') {
							ds.skip(8);
							skipColorTable(ds, ds.readUint8(1));
							ds.skip(1);
						}
						while (true) {
							var l = ds.readUint8(1);
							if (!l) break;
							ds.skip(l);
						}
					}
					previous = undefined;
					if (width && height) {
						var bytes = array.slice(gif, ds.position);
						onItemCallback(offset - acc + gif, ds.position - gif, 'image/gif', 'gif', width, height, bytes);
					}
				} catch (e) {
					if (!width && ds.position - gif > (width * height * 4)) {
						previous = undefined;
						continue;
					}
					previous = array.slice(gif);
					break;
				}
			}

			offset += arrayBuffer.byteLength;
		} else {
			return;
		}
		if (offset >= fileSize) {
			onSuccessCallback();
			return;
		}
		if (!previous) {
			offset -= 3; //length(GIF8) - 1
		}
		chunkReaderBlock(offset, chunkSize, file);
	}

	chunkReaderBlock = function(_offset, length, _file) {
		var r = new FileReader();
		var blob = _file.slice(_offset, length + _offset);
		r.onload = readEventHandler;
		r.readAsArrayBuffer(blob);
		onProgress(~~(100*_offset/fileSize));
	}

	chunkReaderBlock(offset, chunkSize, file);
}

function searchJPGs(file, onItemCallback, onSuccessCallback, onProgress) {
	var chunkReaderBlock = null;
	var fileSize = file.size;
	var chunkSize = 2 * 1024 * 1024;
	var offset = 0;

	var previous = undefined;

	var readEventHandler = function(evt) {
		if (evt.target.error == null) {
			var arrayBuffer = this.result;
			var array;
			var acc = 0;
			
			if (previous) {
				acc += previous.length;
				array = new Uint8Array(previous.length + arrayBuffer.byteLength);
				array.set(previous, 0);
				array.set(new Uint8Array(arrayBuffer), previous.length);
			} else {
				array = new Uint8Array(arrayBuffer);
			}
			
			var jpg = indexOf(array, [255,216,255]); //\xff\xd8
			for (;jpg!=-1;jpg=indexOf(array, [255,216,255], jpg+1)) {
				var width = undefined, height = undefined, jfif = false, exif = false, eof = -1;
				try {
					var ds = new DataStream(array);
					ds.skip(jpg)
					ds.endianness = false;
					ds.skip(2);
					var b = ds.readUint8();
					var skipFor = false;
					while (true) {
						while (b!=255) {
							b = ds.readUint8();
						}
						while (b==255) {
							b = ds.readUint8();
						}
						var hasChunk = [208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 0].indexOf(b) == -1;
						if (hasChunk) {
							var jpgChunkSize = ds.readUint16() - 2;
							var chunkOffset = ds.position;
							var nextChunkOffset = chunkOffset + jpgChunkSize;
						}
						if (b >= 192 && b <= 195) {
							ds.skip(1);
							height = ds.readUint16();
							width = ds.readUint16();
							if (!jfif && !exif) {
								//no jfif nor exif, give up and skip it
								skipFor = true;
								break;
							}
						} else if (b == 217) {
							eof = ds.position;
							break;
						} else if (b == 224) {
							jfif = indexOf(ds.readInt8Array(4), [74,70,73,70]) == 0;
						} else if (b == 225) {
							exif = indexOf(ds.readInt8Array(4), [69,120,105,102]) == 0;
						}
						if (hasChunk) {
							ds.seek(nextChunkOffset);
						}
						b = ds.readUint8();
					}
					if (skipFor) {
						continue;
					}
					previous = undefined;
					if (width && height) {
						var bytes = array.slice(jpg, eof);
						onItemCallback(offset - acc + jpg, eof-jpg, 'image/jpeg', 'jpg', width, height, bytes);
					}
				} catch (e) {
					if (!width && ds.position - jpg > (width * height * 4)) {
						previous = undefined;
						continue;
					}
					previous = array.slice(jpg);
					break;
				}
			}

			offset += arrayBuffer.byteLength;
		} else {
			return;
		}
		if (offset >= fileSize) {
			onSuccessCallback();
			return;
		}
		if (!previous) {
			offset -= 2; //3 bytes header length - 1
		}
		chunkReaderBlock(offset, chunkSize, file);
	}

	chunkReaderBlock = function(_offset, length, _file) {
		var r = new FileReader();
		var blob = _file.slice(_offset, length + _offset);
		r.onload = readEventHandler;
		r.readAsArrayBuffer(blob);
		onProgress(~~(100*_offset/fileSize));
	}

	chunkReaderBlock(offset, chunkSize, file);
}

function searchPNGs(file, onItemCallback, onSuccessCallback, onProgress) {
	var chunkReaderBlock = null;
	var fileSize = file.size;
	var chunkSize = 2 * 1024 * 1024;
	var offset = 0;
	
	var previous = undefined;

	var readEventHandler = function(evt) {
		if (evt.target.error == null) {
			var arrayBuffer = this.result;
			var array;
			var acc = 0;
			
			if (previous) {
				acc += previous.length;
				array = new Uint8Array(previous.length + arrayBuffer.byteLength);
				array.set(previous, 0);
				array.set(new Uint8Array(arrayBuffer), previous.length);
			} else {
				array = new Uint8Array(arrayBuffer);
			}
		
			var png = indexOf(array, [137, 80, 78, 71, 13, 10, 26, 10]);
			for (;png!=-1;png=indexOf(array, [137, 80, 78, 71, 13, 10, 26, 10], png+1)) {
				var width = undefined, height = undefined, ihdr = false;
				try {
					var ds = new DataStream(array);
					ds.skip(png)
					ds.endianness = false;
					ds.skip(8+4);
					ihdr = indexOf(ds.readInt8Array(4), [73,72,68,82]) == 0;
					if (!ihdr) {
						continue;
					}
					width = ds.readUint32();
					height = ds.readUint32();

					var iend = indexOf(array, [73, 69, 78, 68, 174, 66, 96, 130], png);
					if (iend == -1) {
						/**/
						if (array.length > width * height * 4) {
							/*can't find iend*/
							previous = undefined;
							continue;
						}
						previous = array.slice(png);
						break;
					}
					previous = undefined;
					if (width && height) {
						var bytes = array.slice(png, iend + 8);
						onItemCallback(offset - acc + png, iend - png + 8, 'image/png', 'png', width, height, bytes);
					}
				} catch (e) {
					if (!width && ds.position - png > (width * height * 4)) {
						previous = undefined;
						continue;
					}
					previous = array.slice(png);
					break;
				}
			}
			offset += arrayBuffer.byteLength;
		} else {
			return;
		}
		if (offset >= fileSize) {
			onSuccessCallback();
			return;
		}
		if (!previous) {
			offset -= 7; //8 bytes header length - 1
		 }
		chunkReaderBlock(offset, chunkSize, file);
	}

	chunkReaderBlock = function(_offset, length, _file) {
		var r = new FileReader();
		var blob = _file.slice(_offset, length + _offset);
		r.onload = readEventHandler;
		r.readAsArrayBuffer(blob);
		onProgress(~~(100*_offset/fileSize));
	}

	chunkReaderBlock(offset, chunkSize, file);
}

function searchBMPs(file, onItemCallback, onSuccessCallback, onProgress) {
	var chunkReaderBlock = null;
	var fileSize = file.size;
	var chunkSize = 2 * 1024 * 1024;
	var offset = 0;
	
	var previous = undefined;

	var readEventHandler = function(evt) {
		if (evt.target.error == null) {
			var arrayBuffer = this.result;
			var array;
			var acc = 0;
			
			if (previous) {
				acc += previous.length;
				array = new Uint8Array(previous.length + arrayBuffer.byteLength);
				array.set(previous, 0);
				array.set(new Uint8Array(arrayBuffer), previous.length);
			} else {
				array = new Uint8Array(arrayBuffer);
			}
		
			var bmp = indexOf(array, [66,77]);
			for (;bmp!=-1;bmp=indexOf(array, [66,77], bmp+1)) {
				var width = undefined, height = undefined;
				try {
					var ds = new DataStream(array);
					ds.skip(bmp+2)
					ds.endianness = true;
					var length = ds.readUint32();
					var shouldBeZero = ds.readUint32();
					if (shouldBeZero>0) {
						continue;
					}
					ds.skip(8);
					width = ds.readUint32();
					height = ds.readUint32();
					if (width > 20000 || height > 20000) {
						continue;
					}
					ds.skip(length-4-4-8-4-4-4);
					previous = undefined;
					if (width && height) {
						var bytes = array.slice(bmp, length);
						onItemCallback(offset - acc + bmp, length, 'image/bmp', 'bmp', width, height, bytes);
					}
				} catch (e) {
					if (!width && ds.position - bmp > (width * height * 4)) {
						previous = undefined;
						continue;
					}
					previous = array.slice(bmp);
					break;
				}
			}
			offset += arrayBuffer.byteLength;
		} else {
			return;
		}
		if (offset >= fileSize) {
			onSuccessCallback();
			return;
		}
		if (!previous) {
			offset -= 1; //2 bytes header length - 1
		 }
		chunkReaderBlock(offset, chunkSize, file);
	}

	chunkReaderBlock = function(_offset, length, _file) {
		var r = new FileReader();
		var blob = _file.slice(_offset, length + _offset);
		r.onload = readEventHandler;
		r.readAsArrayBuffer(blob);
		onProgress(~~(100*_offset/fileSize));
	}

	chunkReaderBlock(offset, chunkSize, file);
}

function searchWAVs(file, onItemCallback, onSuccessCallback, onProgress) {
	var chunkReaderBlock = null;
	var fileSize = file.size;
	var chunkSize = 5 * 1024 * 1024;
	var offset = 0;
	
	var previous = undefined;

	var readEventHandler = function(evt) {
		if (evt.target.error == null) {
			var arrayBuffer = this.result;
			var array;
			var acc = 0;
			
			if (previous) {
				acc += previous.length;
				array = new Uint8Array(previous.length + arrayBuffer.byteLength);
				array.set(previous, 0);
				array.set(new Uint8Array(arrayBuffer), previous.length);
			} else {
				array = new Uint8Array(arrayBuffer);
			}
		
			var wav = indexOf(array, [82,73,70,70]); //RIFF
			for (;wav!=-1;wav=indexOf(array, [82,73,70,70], wav+1)) {
				try {
					var ds = new DataStream(array);
					ds.skip(wav+4)
					ds.endianness = true;
					var length = ds.readUint32();
					var wave = indexOf(ds.readInt8Array(4), [87, 65, 86, 69]) == 0;//WAVE
					if (!wave || !length) {
						continue;
					}
					var fmt = indexOf(ds.readInt8Array(4), [102,109,116,32]) == 0;
					if (!fmt) {
						continue;
					}
					ds.skip(4+2);
					var channels = ds.readUint16();
					var sampleRate = ds.readUint32();
					var byteRate = ds.readUint32();
					ds.skip(2);
					var bitsPerSample = ds.readUint16();
					ds.skip(length-28);
					previous = undefined;
					//add some length check here
					if (true) {
						console.log(channels);
						var bytes = array.slice(wav, length+8);
						var duration = (1000*(length+8))/byteRate;
						onItemCallback(offset - acc + wav, length+8, 'audio/wav', 'wav', undefined, undefined, bytes, duration);
					}
				} catch (e) {
					previous = array.slice(wav);
					break;
				}
			}
			offset += arrayBuffer.byteLength;
		} else {
			return;
		}
		if (offset >= fileSize) {
			onSuccessCallback();
			return;
		}
		if (!previous) {
			offset -= 3; //4 bytes header length - 1
		 }
		chunkReaderBlock(offset, chunkSize, file);
	}

	chunkReaderBlock = function(_offset, length, _file) {
		var r = new FileReader();
		var blob = _file.slice(_offset, length + _offset);
		r.onload = readEventHandler;
		r.readAsArrayBuffer(blob);
		onProgress(~~(100*_offset/fileSize));
	}

	chunkReaderBlock(offset, chunkSize, file);
}

function searchMP3s(file, onItemCallback, onSuccessCallback, onProgress) {
	var chunkReaderBlock = null;
	var fileSize = file.size;
	var chunkSize = 2 * 1024 * 1024;
	var offset = 0;

	var previous = undefined;
	var firstFrame = undefined;
	
	const calcDuration = bfs => Math.floor(arraySum(Object.keys(bfs).map((k, i) => 1000*bfs[k]/(k/8))));
	
	const bitrates = [0, 32000, 40000, 48000, 56000, 64000, 80000, 96000, 112000, 128000, 160000, 192000, 224000, 256000, 320000];
	const samplingRates = [44100, 48000, 32000];

	var readEventHandler = function(evt) {
		if (evt.target.error == null) {
			var arrayBuffer = this.result;
			var array;
			var acc = 0;
			var framesCount = 0;
			var bfs = {};
			
			if (previous) {
				acc += previous.length;
				array = new Uint8Array(previous.length + arrayBuffer.byteLength);
				array.set(previous, 0);
				array.set(new Uint8Array(arrayBuffer), previous.length);
			} else {
				array = new Uint8Array(arrayBuffer);
			}
			
			var jpg = indexOf(array, [255]); //\xff
			for (;jpg!=-1;jpg=indexOf(array, [255], jpg+1)) {
				try {
					var ds = new DataStream(array);
					ds.skip(jpg)
					ds.endianness = false;
					var continueFor;
					while (true) {
						continueFor = false;
						var header = ds.readUint32();
						if (((header & 0xFFE00000) >>> 0) != 0xFFE00000) {
							continueFor = true;
							break;
						}
						var versionId = (header & 0x00180000) >> 19;
						if (versionId == 1 || versionId != 3) {
							continueFor = true;
							break;
						}
						var layerDescription = (header & 0x00060000) >> 17;
						if (layerDescription == 0 || layerDescription != 1) {
							continueFor = true;
							break;
						}
						var bitrateIdx = (header & 0x0000F000) >> 12;
						if (bitrateIdx == 0 || bitrateIdx == 15) {
							continueFor = true;
							break;
						}
						var bitrate = bitrates[bitrateIdx];
						var samplingRateIdx = (header & 0x00000C00) >> 10;
						if (samplingRateIdx == 3) {
							continueFor = true;
							break;
						}
						var samplingRate = samplingRates[samplingRateIdx];
						var paddingBit = ((header & 0x00000200) >> 9);
						var emphasis = (header & 0x00000003)
						if (emphasis == 2) {
							continueFor = true;
							break;
						}
						found = true;
						framesCount++;
						if (firstFrame == undefined) {
							firstFrame = jpg;
						}
						var frameLength = paddingBit + Math.floor(144 * bitrate / samplingRate);
						bfs[bitrate] = bfs[bitrate] ? bfs[bitrate]+frameLength : frameLength;
						ds.skip(frameLength - 4);
						previous = undefined;
					}
					if (continueFor) {
						if (firstFrame && framesCount > 5) {
							var duration = calcDuration(bfs);
							var bytes = array.slice(jpg, ds.position - 4);
							onItemCallback(offset - acc + jpg, bytes.length, 'audio/mpeg', 'mp3', undefined, undefined, bytes, duration);
							//take next frame
							jpg = ds.position;
						}
						firstFrame = undefined;
						framesCount = 0;
						continue;
					}
					previous = undefined;
				} catch (e) {
					previous = array.slice(jpg);
					break;
				}
			}

			offset += arrayBuffer.byteLength;
		} else {
			return;
		}
		if (offset >= fileSize) {
			if (framesCount > 5) {
				var duration = calcDuration(bfs);
				var bytes = array; //whole array is an audio
				onItemCallback(offset - array.length, array.length, 'audio/mpeg', 'mp3', undefined, undefined, bytes, duration);
			}
			onSuccessCallback();
			return;
		}
		if (!previous) {
			offset -= 1;
		}
		chunkReaderBlock(offset, chunkSize, file);
	}

	chunkReaderBlock = function(_offset, length, _file) {
		var r = new FileReader();
		var blob = _file.slice(_offset, length + _offset);
		r.onload = readEventHandler;
		r.readAsArrayBuffer(blob);
		onProgress(~~(100*_offset/fileSize));
	}

	chunkReaderBlock(offset, chunkSize, file);
}