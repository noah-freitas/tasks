;(function () {
    angular.module('type', [])
        .value('Type', function Type(desc) {
            return function (o) {
                for (var prop in desc) if (desc.hasOwnProperty(prop)) {
                    var val = desc[prop];
                    if (val instanceof Error && !o[prop]) throw val;
                    o[prop] = o[prop] || angular.copy(desc[prop]);
                }

                return o;
            };
        });
}());
