module.exports = function Promise()
{
	let promise = this;

	promise.resolved = false;
	promise.failed = false;

	promise.success = (callback) =>
	{
		promise.successCallback = callback;

		if (promise.failed)
		{
			return promise;
		}
		if (promise.resolved)
		{
			callback(promise.result);
		}

		return promise;
	};

	promise.fail = (callback) =>
	{
		promise.failCallback = callback;

		if (promise.failed)
		{
			callback(promise.error);
		}

		return promise;
	};

	promise.resolve = (data) =>
	{
		promise.resolved = true;
		promise.failed = false;
		promise.result = data;
		delete promise.error;

		if (promise.successCallback)
		{
			promise.successCallback(data);
		}
		if (promise.allCallback)
		{
			promise.allCallback();
		}
	};

	promise.reject = (error) =>
	{
		promise.resolved = false;
		promise.failed = true;
		delete promise.result;
		promise.error = error;

		if (promise.failCallback)
		{
			promise.failCallback(error);
		}
		if (promise.allCallback)
		{
			promise.allCallback();
		}
	};

	Promise.all = (list) =>
	{
		let all = {
			count: list.length,
			done: (callback) =>
			{
				if (all.count === 0)
				{
					callback();
					return;
				}

				all.callback = callback;
			}
		};

		list.forEach((promise) => {
			if (promise.resolved || promise.failed)
			{
				--all.count;
				if (all.count === 0)
				{
					all.callback();
				}
				return;
			}
			promise.allCallback = () =>
			{
				--all.count;
				if (all.count === 0)
				{
					all.callback();
				}
			};
		});

		return all;
	};

};