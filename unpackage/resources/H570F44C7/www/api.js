const baseAPI = "http://121.37.25.126/city/public/index.php"

function api(method, url, header, body) {
	const auth = localStorage.getItem("token") | ""
	return new Promise((res, rej) => {
		mui.ajax(baseAPI + url,{
			data:{
				...body
			},
			dataType:'json',//服务器返回json格式数据
			type: method,//HTTP请求类型
			timeout:20000,//超时时间设置为10秒；
			header: {
				Authorization: auth,
				...header
			},
			success:function(data){
				res(data)
			},
			error:function(xhr,type,errorThrown){
				rej(xhr)
			}
		});
	})
}