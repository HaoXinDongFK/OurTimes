var mongoskin = require('mongoskin'),
    xss = require('xss'),
    mcrypto = require('./../util/mcrypto'),
    guid = require('./../util/guid'),
    db = require('./../util/mongo'),
    header = require('./../util/header');


var SERVER_URL = 'http://127.0.0.1:3000/';

var collectionName = 'user',
    user = db.bind(collectionName),
    str2ObjId = mongoskin.helper.toObjectID,
    /*
     + 用户类型，需要根据用户类型，开放通讯录权限
     + 本班权限的同学，可以查询自己班级的通讯录
     */
    USER_TYPE = {
        'GUEST': '游客',
        'BEN': '本班',
        'TEST': '测试',
        'MIDDLE': '中间权限者',
        'ADMIN': 'admin'
    },
    /*
    + 基础的URL，例会头像的服务器URL,默认头像的URL等
    + 可能包括静态文件服务器，所以，数据资源必须独立URL
    */
    BASE_URL = {
        'AVATAR': '/',
        'AVATAR_DEFAULT': ''
    };
/*
 + 用途：用户鉴权，包括注册、登录以及接口调用等
 + 作者：vczero
 + 版本：v2.0 
 + 更新：摒弃封装MongoSkin Util的作法；合并USER_TYPE.js & user.js
 +
 */
module.exports = {
    /*
     + 用户注册
     + 需要这里进行参数的校验，包括邮箱、密码的个数
     + 后期添加验证码模块
     +
     */
    register: function(req, res) {
        header.set(req, res);
        var params = req.body;
        if (params.password && params.password !== params.repeatPassword)
            return res.send(status.repeatPassword);
        if (!params.email)
            return res.send(status.emailLack);
        //构建用户模型；加密等关键信息上线后会有不同算法修改
        var user = {
            userid: guid.create() + '-' + mcrypto.md5Password(params.email).toUpperCase(),
            email: xss(params.email),
            password: mcrypto.md5Password(params.password),
            time: new Date(),
            tag: USER_TYPE.GUEST,
            nickname: '',
            realname: '',
            avatar: SERVER_URL + 'zhu.png',
            address: '',
            job: '',
            tel: '',
            hometown: '',
            sign: ''
        };

        db[collectionName].save(user, function(err, item) {
            if (!err) {
                item.status = 1;
                item.token = item['_id'];
                delete item['password'];
                delete item['_id'];
                return res.send(item);
            } else {
                return res.send({
                    status: 0
                });
            }
        });
    },
    /*
     + 用户登录
     + 获取userid、token等信息
     */
    login: function(req, res) {
        header.set(req, res);
        var user = req.body,
            email = user.email,
            password = mcrypto.md5Password(user.password),
            query = {
                email: email,
                password: password
            };
        db[collectionName].find(query).limit(1).toArray(function(err, items) {
            if (!err && items.length) {
                var item = items[0];
                item.status = 1;
                item.token = item['_id'];
                delete item['password'];
                delete item['_id'];
                return res.send(item);
            } else {
                return res.send({
                    status: 0
                });
            }
        });
    },
    /*
     +
     + 根据userid返回当前用户信息
     */
    get: function(req, res) {
        header.set(req, res);
        var id = req.query.userid; //需要查询人的ID
        var token = req.query.token; //登录用户的token
        if (id) {
            db[collectionName].find({userid: id}).limit(1).toArray(function(err, items) {
                //获取私密信息
                if(token){
                    var error = err, //缓存错误信息
                        data = items; //缓存查询到的用户信息
                    db[collectionName].find({_id: str2ObjId(token)}).toArray(function(err, items){
                        if(!err && items.length && items[0].tag === USER_TYPE.BEN){//本班用户
                            var item = items[0];
                            item.status = 1;
                            delete item['_id'];
                            delete item['password'];
                            return res.send(item);
                        }else{
                            if (!error && data.length) {//验证本班用户失败
                                var item = data[0];
                                item.status = 1;
                                delete item['_id'];
                                delete items['realname'];
                                delete item['password'];
                                delete item['address'];
                                delete item['tel'];
                                delete item['job'];
                                delete item['hometown'];
                                return res.send(item);
                            } else {
                                return res.send({
                                    status: 0
                                });
                            }
                        }
                    });
                }else{ //普通用户
                    if (!err && items.length) {
                        var item = items[0];
                        item.status = 1;
                        delete item['_id'];
                        delete item['password'];
                        delete items['realname'];
                        delete item['address'];
                        delete item['tel'];
                        delete item['job'];
                        delete item['hometown'];
                        return res.send(item);
                    } else {
                        return res.send({
                            status: 0
                        });
                    }
                }
            });
        } else {
            return res.send({
                status: 0
            });
        }
    },
    /*
     + 获取所有的用户的信息
     + 后期采取分页策略
     */
    getAll: function(req, res) {
        header.set(req, res);
        var token = req.query.token;
        db[collectionName].find({_id: str2ObjId(token)}).toArray(function(err, items) {
            //管理员身份校验
            if (!err && items.length && items[0].tag === USER_TYPE.ADMIN) {
                //返回所有用户信息
                db[collectionName].find({}).toArray(function(err, data) {
                    if (!err) {
                        for (var i = 0; i < data.length; i++) {
                            delete data[i]['password'];
                            delete data[i]['_id'];
                        }
                        return res.send({
                            status: 1,
                            items: data
                        });
                    } else {
                        return res.send({
                            status: 0
                        });
                    }
                });
            } else {
                return res.send({
                    status: 0
                });
            }
        });
    },
    /*
     + 更新用户信息
     +
     */
    update: function(req, res) {
        header.set(req, res);
        var user = req.body,
            token = user.token,
            nickname = user.nickname,
            realname = user.realname,
            tel = user.tel,
            address = user.address,
            job = user.job, 
            hometown = user.hometown,
            sign = user.sign, 
            objectID = mongoskin.helper.toObjectID;

        db[collectionName].find({_id: str2ObjId(token)}).toArray(function(err, items) {
            if (!err && items.length) {
                var query = {_id: str2ObjId(token)},
                    $set = {};
                    console.log(user);
                if(items[0].tag === USER_TYPE.BEN){ //本班用户权限
                    $set = {
                        $set: {
                            nickname: xss(nickname) || items[0].nickname,
                            realname: xss(realname) || items[0].realname,
                            tel: xss(tel) || items[0].tel,
                            address: xss(address) || items[0].address,
                            job: xss(job) || items[0].job,
                            hometown: xss(hometown) || items[0].hometown,
                            sign: xss(sign) || items[0].sign,
                            tag: USER_TYPE.BEN
                        }
                    };
                }else{
                    $set = {
                        $set: {
                                nickname: xss(nickname) || items[0].nickname
                        }
                    };
                }
                db[collectionName].update(query, $set, function(err) {
                    if (!err) {
                        return res.send({
                            status: 1
                        });
                    } else {
                        return res.send({
                            status: 0
                        });
                    }
                });

            } else {
                return res.send({
                    status: 0
                });
            }
        });
    },
    /*
     + 删除某个用户
     + 管理员权限
     */
    delete: function(req, res) {
        header.set(req, res);
        var query = req.query,
            userId = query.userid,
            token = query.token;
        db[collectionName].find({_id: str2ObjId(token)}).toArray(function(err, items) {
            if (!err && items.length && items[0].tag === USER_TYPE.ADMIN) {
                db[collectionName].remove({
                    userid: userid
                }, function(err) {
                    if (!err) {
                        return res.send({
                            status: 1
                        });
                    } else {
                        return res.send({
                            status: 0
                        });
                    }
                });
            } else {
                return res.send({
                    status: 0
                });
            }
        });
    },
    /*
     +
     + 更新用户的类型标签
     +
     */
    updateTag: function(req, res) {
        header.set(req, res);
        var query = req.body,
            userId = query.userid,
            tag = query.tag,
            token = query.token;

        db[collectionName].find({ _id: str2ObjId(token)}).toArray(function(err, items) {
            if (!err && items.length && items[0].tag === USER_TYPE.ADMIN) {
                var query = {
                        userid: userId
                    },
                    $set = {
                        $set: {
                            tag: tag //更新用户的标签，必须判断是否存在此标签
                        }
                    };
                db[collectionName].update(query, $set, function(err) {
                    if (!err) {
                        return res.send({
                            status: 1
                        });
                    } else {
                        return res.send({
                            status: 0
                        });
                    }
                })

            } else {
                return res.send({
                    status: 0
                });
            }
        });
    }
};