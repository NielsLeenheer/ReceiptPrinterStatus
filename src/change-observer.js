class ChangeObserver {
    
    static create(options) {

        let callback = options.callback;
        let target = options.target;

        return new Proxy (target, {
            get(target, property, receiver) {
                if (property === 'target') {
                    return target;
                }

                return Reflect.get(target, property, receiver)
            },

            set(obj, prop, value) {        

                if (obj[prop] !== value) {
                    obj[prop] = value;

                    callback(obj);
                }

                return true;
            }
        });
    }
}

export default ChangeObserver;