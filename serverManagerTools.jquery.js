'use strict';

const serverManagerTools = (function()
{
	let _buffer = {};
	let _eventConnect = new Event('websocket_onconnect')
	let _eventDisconnect = new Event('websocket_ondisconnect')
	let _httpSendTimer = null;
	let _httpSendBuffer = [];
	let _httpSendDeferreds = {};
	let _webSocket;
	let _webSocketRequests = {};
	let _webSocketListeners = {};
	let _webSocketProtocol = (location.protocol === 'https' ? 'wss://' : 'ws://');
	let _tools = {
		'cookie': 
		{
			'read': function(name)
			{
				let cookies = document.cookie.split('; ');
				let match = escape(name) + '=';

				for (let cookie in cookies)
				{
					if (cookie.substr(0, match.length) === match)
					{
						return unescape(cookie.substr(match.length));
					}
				}
			},
			'write': function(name, value, age)
			{
				document.cookie = escape(name) + '=' + escape(value) + (age ? '; max-age=' + age : '');
			},
			'delete': function(name)
			{
				document.cookie = escape(name) + '=; max-age=-1';
			}
		}, // cookie
		
		'http':
		{
			'options': {
				postDelay: 10,
				permanentId: false
			},
			'fetch': function(action, parameters)
			{
				let deferred = $.Deferred();

				if (_buffer[action] && $.equals(parameters, _buffer[action].parameters))
				{
					deferred.resolve(_buffer[action].response);

					if (!_buffer[action].isPermanent)
					{
						delete _buffer[action];
					}
					
					return deferred;
				}

				let requestId = new Date().getTime() + Math.random();
				let userId;

				_httpSendDeferreds[requestId] = deferred;
				
				if (localStorage && localStorage.getItem)
				{
					userId = localStorage.userId;
				}
				else
				{
					userId = cookie.read('userId');
				}

				let requestData = {
					requestId: requestId,
					action: action
				};

				if (parameters)
				{
					requestData.parameters = parameters;
				}

				_httpSendBuffer.push(requestData);

				if (_httpSendTimer)
				{
					clearTimeout(_httpSendTimer);
				}
				_httpSendTimer = setTimeout(
					function()
					{
						clearTimeout(_httpSendTimer);
						_httpSendTimer = null;

						let sendData = {
							actions: _httpSendBuffer
						};

						if (userId)
						{
							sendData.userId = userId;
						}

						$.post({
							method: 'POST',
							url: '/',
							data: JSON.stringify(sendData)
						})
						.then(
							function(responseData)
							{
								if (responseData.userId)
								{
									if (_tools.http.options.permanentId && localStorage && localStorage.setItem)
									{
										localStorage.setItem('userId', responseData.userId);
									}
									else if (sessionStorage && sessionStorage.setItem)
									{
										sessionStorage.setItem('userId', responseData.userId);
									}
									else
									{
										cookie.write('userId', responseData.userId, _tools.http.options.permanentId && (86400 * 365 * 10));
									}
								}

								_buffer = $.extend(_buffer, responseData.buffer);
								
								for (let requestId in responseData.responses)
								{
									let response = responseData.responses[requestId];

									if (response.status === 'error') 
									{
										deferred.reject(response.data);
										return;
									}
				
									_httpSendDeferreds[requestId].resolve(response.data);
									delete _httpSendDeferreds[requestId];
								}
							},
							function(response, r)
							{
								deferred.reject(response.statusText);
							}
						); // $.post().then()

						_httpSendBuffer = [];
					}, // setTimeout(function(){})
					_tools.http.options.postDelay || 10
				); // setTimeout
				
				return deferred;
			} // .fetch
		}, // http
		
		'webSocket':
		{
			'options': {},
			'loader': $.Deferred(),
			'supported': !!WebSocket,
			'start': function(options)
			{
				_tools.webSocket.optios = options;
				_webSocket = new connectWebSocket();				
				return _tools.webSocket.loader;
			},
			'addListener': function(key, callback)
			{
				_webSocketListeners[key] = callback;
			},
			'fetch': function(action, parameters)
			{
				if (_buffer[action] && $.equals(parameters, _buffer[action].parameters))
				{
					let deferred = $.Deferred();

					deferred.resolve(_buffer[action].response);

					if (!_buffer[action].isPermanent)
					{
						delete _buffer[action];
					}
					
					return deferred;
				}

				let sendData = {
					requestId: new Date().getTime() + Math.random(),
					action: action
				};

				let userId;

				if (localStorage && localStorage.getItem)
				{
					userId = localStorage.userId;
				}
				else if (sessionlStorage && sessionlStorage.getItem)
				{
					userId = sessionlStorage.userId;
				}
				else
				{
					userId = cookie.read('userId');
				}
				if (userId)
				{
					sendData.userId = userId;
				}

				if (parameters)
				{
					sendData.parameters = parameters;
				}
					
				let deferred = _webSocketRequests[sendData.requestId] = $.Deferred();		

				if (_webSocket.readyState === 1)
				{
					_webSocket.send(JSON.stringify(sendData));
				}
				else
				{
					deferred.reject();
				}

				return deferred;
			} // .fetch
		}, // .webSocket

		'server':
		{
			'loader': $.Deferred(),
			'start': function(options)
			{
				let services = [];

				options = options || {};
				
				options.webSocket = !!options.webSocket && _tools.webSocket.supported;

				_tools.http.options = options;

				if (options.webSocket)
				{
					services.push(_tools.webSocket.start(options));
				}

				$.when(services).then(function()
				{
					if (options.webSocket)
					{
						_tools.server.fetch = _tools.webSocket.fetch;
						_tools.server.addListener = _tools.webSocket.addListener;
						_tools.server.usingWebSocket = true;
					}
					else
					{
						_tools.server.fetch = _tools.http.fetch;
						_tools.server.addListener = function() { };
						_tools.server.usingWebSocket = false;
					}

					_tools.server.loader.resolve();
				});

				return _tools.server.loader;
			},
			'readStore': function(name, defaultValue)
			{
				let value;

				if (localStorage && localStorage.getItem)
				{
					value = localStorage.getItem(name)
				}
				else
				{
					value = cookie.read(name);
				}
				if (value === undefined)
				{
					return defaultValue;
				}
				try
				{
					return JSON.parse(value);
				}
				catch(err)
				{
					return defaultValue;
				}
			},
			'writeStore': function(name, data, isPermanent)
			{
				if (isPermanent && localStorage && localStorage.setItem)
				{
					localStorage.setItem(name, JSON.stringify(data));
					return;
				}
				if (sessionStorage && sessionStorage.setItem)
				{
					sessionStorage.setItem(name, JSON.stringify(data));
					return;
				}

				cookie.write(name, JSON.stringify(data), isPermanent);
			},
			'deleteStore': function(name)
			{
				if (localStorage && localStorage.deleteItem)
				{
					delete localStorage.deleteItem(name);
				}
				else
				{
					cookie.delete(name);
				}
			}
		}, // .server

		setUnselectable: function(element)
		{
			element.onselectstart = function() { return false; };
			element.style.MozUserSelect = "none";
			element.style.KhtmlUserSelect = "none";
			element.unselectable = "on";
		} // setUnselectable
	};

	if (!_tools.webSocket.supported)
	{
		_tools.webSocket.loader.resolve();
	}

	return _tools;

	function connectWebSocket()
	{
		let webSocket = new WebSocket(_webSocketProtocol + location.host);

		webSocket.onmessage = function(messageEvent)
		{
			try
			{
				let responseData = JSON.parse(messageEvent.data);
				let deferred = _webSocketRequests[responseData.requestId];

				if (responseData.status === 'error') 
				{
					deferred.reject(responseData.data);
					return;
				}

				if (responseData.buffer)
				{
					_buffer = $.extend(_buffer, responseData.buffer);
				}

				if (responseData.userId)
				{
					if (_tools.webSocket.options.permanentId && localStorage && localStorage.setItem)
					{
						localStorage.setItem('userId', responseData.userId);
					}
					else if (sessionStorage && sessionStorage.setItem)
					{
						sessionStorage.setItem('userId', responseData.userId);
					}
					else
					{
						cookie.write('userId', responseData.userId, _tools.webSocket.options.permanentId && (86400 * 365 * 10));
					}
				}

				for (let key in _webSocketListeners)
				{
					if (key === responseData.requestId)
					{
						_webSocketListeners[key](responseData.data);
						return;
					}
				}

				deferred.resolve(responseData.data);
			}
			catch (err)
			{
				console.log(err);
			}
		};

		webSocket.onopen = function()
		{
			document.dispatchEvent(_eventConnect)
			_tools.webSocket.loader.resolve();
		};

		webSocket.onclose = function()
		{
			if (document.dispatchEvent(_eventDisconnect))
			{
				_webSocket = new connectWebSocket()
			}
		};

		return webSocket;
	};

})();