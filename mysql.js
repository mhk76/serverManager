const $mysql = module.parent.parent.require('mysql');
const $sqlstring = require('sqlstring');
const $Promise = require('./promise.js');

module.exports = (config) =>
{
	let _connection
	let _module = { starting: new $Promise() };

	try
	{
		_connection = $mysql.createConnection(config);
		_connection.connect((err) =>
			{
				if (err)
				{
					_module.starting.reject(err.sqlMessage);
					return;
				}
				_module.starting.resolve();
			});
	}
	catch (exception)
	{
		_module.starting.reject(exception);
	}

	_module.query = (sql, parameters) =>
		{
			let promise = new $Promise();

			for (let p in parameters)
			{
				sql = sql.replace('@' + p, $sqlstring.escape(parameters[p]));
			}

			setTimeout(() =>
			{
				_connection.query(
					sql,
					parameters,
					(err, result, fields) =>
					{
						if (err)
						{
							promise.reject(err.sqlMessage);
							return;
						}
						promise.resolve({
							result: result,
							fields: fields
						});
					}
				);
			});
			
			return promise;
		};

	_module.verifyTable = (name, columns, primaryKey) =>
		{
			let promise = new $Promise();

			_module.query(
					'SELECT column_name FROM information_schema.columns WHERE table_name = @name;',
					{ 'name': name }
				)
				.then((data) =>
				{
					if (data.result.length === 0)
					{
						let sql = ['CREATE TABLE `', name, '` ('];
						let list = [];

						for (let c in columns)
						{
							list.push([' `', c, '` ', columns[c]].join(''));
						}

						sql.push(list.join(','));

						if (primaryKey)
						{
							sql.push(
								', PRIMARY KEY (',
								primaryKey.map((item) =>
								{
									return '`' + item + '`';
								}),
								')'
							);
						}

						sql.push(');');

						_module.query(sql.join(''))
							.then((data) =>
							{
								promise.resolve();
							})
							.catch((err) =>
							{
								promise.reject(err);
							});

						return;
					}

					for (let c in columns)
					{
						if (!data.result.some((item) =>
						{
							return item.column_name === c;
						}))
						{
							promise.reject('Column `' + c + '` was not found in the table `' + name + '`');
							return;
						}
					}

					promise.resolve();
				})
				.catch((err) =>
				{
					promise.reject(err);
				});

			return promise;
		};

	_module.insert = (tableName, data) =>
		{
			return _module.query(
				generateInsertSql('INSERT INTO ', tableName, data)
			);
		};

	_module.replace = (tableName, data) =>
		{
			return _module.query(
				generateInsertSql('REPLACE INTO ', tableName, data)
			);
		};

	_module.encode = (data) =>
		{
			return $sqlstring.escape(data);
		};

	return _module;

	function generateInsertSql(command, tableName, data)
	{
		let sql = [command, tableName, ' ('];
		let list = [];
					
		if (Array.isArray(data))
		{
			for (let d in data)
			{
				list.push(d);
			}

			sql.push(list.join(', '), ') VALUES ');

			list = [];
			
			for (let r = 0; r < data.length; r++)
			{
				list.push(
					[
						'(',
						addData(data[r]),
						')'
					].join('')
				);
			}

			sql.push(list.join(', '));
		}
		else 
		{
			for (let d in data)
			{
				list.push(d);
			}

			sql.push(list.join(', '), ') VALUES (', addData(data), ')');
		}

		return sql.join('');

		function addData(data)
		{
			let list = [];

			for (let d in data)
			{
				list.push($sqlstring.escape(data[d]));
			}

			return list.join(', ');
		}
	}
};
