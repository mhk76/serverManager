'use strict';

const serverManagerTools = (function()
{
	let _dictionary = {};
	let _lang = null;
	let _dictionaryEvent = new Event('setdictionarylanguage');
	let _dialog = [];
	let _dialogMask = [];
	let _dialogIndex = -1;
	let _buffer = {};
	let _httpSendTimer = null;
	let _httpSendBuffer = [];
	let _httpSendDeferreds = {};
	let _webSocket;
	let _webSocketRequests = {};
	let _webSocketListeners = {};
	let _webSocketProtocol = (location.protocol === 'https' ? 'wss://' : 'ws://');
	let _tools = {
		'dictionary': 
		{
			'loader': $.Deferred(),
			'start': function()
			{
				$.get('dictionary.json')
					.then(
						function(data)
						{
							_dictionary = data;

							for (let i in window.navigator.languages)
							{
								let lang = window.navigator.languages[i];

								if (_dictionary[lang])
								{
									_lang = lang;
									break;
								}
								if (lang.length === 5 && _dictionary[lang.substr(0, 2)])
								{
									_lang = lang.substr(0, 2);
									break;
								}
							}

							if (_lang === null)
							{
								_lang = Object.keys(_dictionary)[0];
							}

							_tools.dictionary.lang = _lang;
							_tools.dictionary.loader.resolve();
						},
						function(response)
						{
							throw 'Failed to load dictionary';
						}
					);

				return _tools.dictionary.loader;
			},
			'lang': null,
			'setLang': function(lang)
			{
				if (_dictionary[lang])
				{
					_lang = lang;
					document.dispatchEvent(_dictionaryEvent);
					return true;
				}
				return false;
			},
			'get': function(term, index, defaultValue)
			{
				if (defaultValue === undefined && typeof index === 'string')
				{
					return (_dictionary[_lang] && _dictionary[_lang][term]) || index;
				}
				if (index === undefined)
				{
					return (_dictionary[_lang] && _dictionary[_lang][term]) || defaultValue || term;
				}
				if (_dictionary[_lang] && _dictionary[_lang][term])
				{
					return _dictionary[_lang][term][index] || (term + index);
				}
				return term + index;
			},
			'getLanguages': function()
			{
				let list = {};

				for (let lang in _dictionary)
				{
					list[lang] = _dictionary[lang]['_lang'];
				}

				if (Object.keys(list).length > 1)
				{
					return list;
				}
				return {};
			},
			'formatDate': function(date, format)
			{
				if (typeof date === 'string')
				{
					date = new Date(date);
				}

				let dateStr = _dictionary[_lang][format || '_date'] || '%yyyy-%mm-%dd';
				let month = date.getMonth() + 1;
				let day = date.getDate();
				let hours = date.getHours();
				let minutes = date.getMinutes();

				if (dateStr.indexOf('%a') === -1)
				{
					dateStr = dateStr.replace('%yyyy', date.getFullYear());
					dateStr = dateStr.replace('%yy', date.getYear());
					dateStr = dateStr.replace('%dd', leftPad(day, 2, '0'));
					dateStr = dateStr.replace('%d', day);
					dateStr = dateStr.replace('%mm', leftPad(month, 2, '0'));
					dateStr = dateStr.replace('%m', month);
					dateStr = dateStr.replace('%hh', leftPad(hours, 2, '0'));
					dateStr = dateStr.replace('%h', hours);
					dateStr = dateStr.replace('%nn', leftPad(minutes, 2, '0'));
					dateStr = dateStr.replace('%n', minutes);
				}
				else
				{
					dateStr = dateStr.replace('%yyyy', date.getFullYear());
					dateStr = dateStr.replace('%yy', date.getYear());
					dateStr = dateStr.replace('%mm', leftPad(month, 2, '0'));
					dateStr = dateStr.replace('%m', month);
					dateStr = dateStr.replace('%dd', leftPad(day, 2, '0'));
					dateStr = dateStr.replace('%d', day);
					dateStr = dateStr.replace('%nn', leftPad(minutes, 2, '0'));
					dateStr = dateStr.replace('%n', minutes);
					if (hours >= 12)
					{
						dateStr = dateStr.replace('%a', 'PM');
						hours = hours - 12;
					}
					else
					{
						dateStr = dateStr.replace('%a', 'AM');
					}
					hours = (hours === 0 ? 12 : hours);
					dateStr = dateStr.replace('%hh', leftPad(hours, 2, '0'));
					dateStr = dateStr.replace('%h', hours);
				}

				return dateStr;
			}
		}, // dictionary

		'showDialog': function(message, buttons, template)
		{
			document.body.style.overflow = 'hidden';

			return (function(dialogIndex)
			{
				if (!_dialog[dialogIndex])
				{
					_dialog[dialogIndex] = $('<div class="smDialog level' + (dialogIndex % 3) + '"><span class="message"></span><p></p><div class="buttons"></div></div>');
					_dialogMask[dialogIndex] = $('<div class="smDialogMask level' + (dialogIndex % 3) + '"></div>');
					$(document.body)
						.append(_dialog[dialogIndex])
						.append(_dialogMask[dialogIndex]);
				}
	
				let messageText;
	
				if (Array.isArray(message))
				{
					messageText = _tools.dictionary.get(message[0]);
	
					for (let i = 1; i < message.length; i++)
					{
						messageText = messageText.replace(message[i].key, _tools.dictionary.get(message[i].message, message[i].index));
					}
				}
				else
				{
					messageText = _tools.dictionary.get(message);
				}

	
				let dialog = _dialog[dialogIndex];
				let dialogMask = _dialogMask[dialogIndex];
				let dialogElements = dialog.find('p');
				let dialogButtons = dialog.find('div');
				let templateElements = {};
				let firstElement;
				let hotkeyMap = {};
				let hotkeyList = [];
				
				dialog.find('span').text(messageText);
				dialogElements.empty();
				dialogButtons.empty();

				if (template)
				{
					for (let i = 0; i < template.length; i++)
					{
						let item = template[i];
						let element = $('<span></span>');

						element.attr('class', item.class);

						switch (item.type)
						{
							case 'text':
							{
								element.text(_tools.dictionary.get(item.text));
								break;
							}
							case 'html':
							{
								element.html(item.html);
								break;
							}
							case 'input':
							case 'email':
							case 'number':
							case 'range':
							case 'search':
							{
								let input = $('<input/>');

								input.attr('type', item.type === 'input' ? 'text' : item.type);
								input.attr('maxlength', item.maxlength);
								input.attr('min', item.min);
								input.attr('max', item.max);
								input.attr('step', item.step);
								input.attr('value', item.default);

								if (item.placeholder)
								{
									input.attr('placeholder', _tools.dictionary.get(item.placeholder));
								}

								if (item.onchange)
								{
									input.bind('change', item.onchange);
								}

								templateElements[item.name || item.type + i] = input;
								
								if (!firstElement)
								{
									firstElement = input;
								}

								element.append(input);
								break;
							}
						}

						dialogElements.append(element);
					} // for (template)
				} // if (template)

				if (!buttons)
				{
					buttons = [{
						text: 'close',
						default: true,
						cancel: true
					}];
				}

				for (let i = 0; i < buttons.length; i++)
				{
					let button = buttons[i];
					let element = $('<button></button>');				

					element.text(_tools.dictionary.get(button.text, button.index));
					element[0].clickEvent = button.onclick; 
					element.on(
						"click",
						function()
						{
							if (this.clickEvent) 
							{
								let returnValue = this.clickEvent(templateElements);

								if (returnValue)
								{
									if (returnValue.then)
									{
										returnValue.then(function()
										{
											CloseDialog();
										});
									}
									return;
								}
							}
							CloseDialog();
						}
					);

					if (button.default)
					{
						hotkeyMap['Enter'] = element;
					}
					if (button.cancel)
					{
						hotkeyMap['Escape'] = element;
					}
					if (button.hotkey)
					{
						hotkeyMap[button.hotkey] = element;
					}

					dialogButtons.append(element);
				} // for (buttons)

				if (Object.keys(hotkeyMap).length > 0)
				{
					hotkeyList = Object.keys(hotkeyMap);
					window.addEventListener('keydown', onkeypress);
				}

				dialogMask
					.css({ 'z-index': 1000 + 2 * dialogIndex })
					.show();
				dialog
					.css({ 'z-index': 1000 + 2 * dialogIndex + 1 })
					.show();

				if (firstElement)
				{
					firstElement[0].focus();
					if (firstElement[0].select)
					{
						firstElement[0].select();
					}
				}

				function onkeypress(event)
				{
					if (hotkeyList.indexOf(event.key) !== -1 && dialogIndex === _dialogIndex)
					{
						hotkeyMap[event.key][0].click();
						event.stopImmediatePropagation();
						return true;
					}
				}

				return CloseDialog;

				function CloseDialog()
				{
					_dialog[dialogIndex].hide();
					_dialogMask[dialogIndex].hide();
					--_dialogIndex;
	
					window.removeEventListener('keydown', onkeypress);
	
					if (_dialogIndex === -1)
					{
						document.body.style.overflow = '';
					}
				}
					
			})(++_dialogIndex); // return new function()
		}, // showDialog

		'dialog':
		{
			'ok': function(message)
			{
				_tools.showDialog(message);
			},

			'yesNo': function(message, yesCallback, noCallback)
			{
				_tools.showDialog(
					message,
					[
						{
							text: 'yes',
							hotkey: _tools.dictionary.get('yes-key'),
							default: true,
							onclick: yesCallback
						},
						{
							text: 'no',
							hotkey: _tools.dictionary.get('no-key'),
							cancel: true,
							onclick: noCallback
						}
					]
				);
			}, // .yesNo()

			'input': function(message, acceptCallback, cancelCallback, defaultText)
			{
				if (cancelCallback && !$.isFunction(cancelCallback))
				{
					if (!defaultText)
					{
						defaultText = cancelCallback;
					}
					cancelCallback = function() {};
				}

				_tools.showDialog(
					message,
					[
						{
							text: 'ok',
							default: true,
							onclick: function(items)
							{
								return acceptCallback(items['inputText'].val());
							}
						},
						{
							text: 'cancel',
							cancel: true,
							onclick: cancelCallback
						}
					],
					[{
						type: 'input',
						name: 'inputText',
						default: defaultText
					}]
				);
			} // .input()
		}, //dialog
		
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
										dialog.ok(response.data);
										deferred.reject(response.data);
										return;
									}
				
									_httpSendDeferreds[requestId].resolve(response.data);
									delete _httpSendDeferreds[requestId];
								}
							},
							function(response, r)
							{
								dialog.ok(response.statusText);
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
			'onconnect': null,
			'ondisconnect': null,
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
						_tools.webSocket.onconnect = options.onconnect;
						_tools.webSocket.ondisonnect = options.ondisconnect;
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


	function leftPad(number, length, padChar)
	{
		let output = number.toString();

		if (output.length < length)
		{
			return (padChar || '0').toString().substr(0, 1).repeat(length - output.length) + output;
		}

		return output.slice(-length);
	};

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
					dialog.ok(responseData.data);
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
				dialog.ok('unknown-error');
			}
		};

		webSocket.onopen = function()
		{
			if (_tools.webSocket.onconnect)
			{
				_tools.webSocket.onconnect();
			}
			_tools.webSocket.loader.resolve();
		};

		webSocket.onclose = function()
		{
			if (_tools.webSocket.ondisconnect && _tools.webSocket.ondisconnect())
			{
				_webSocket = new connectWebSocket();
			}
		};

		return webSocket;
	};

})();
