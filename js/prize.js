;(function () {
    angular.module('prize', [])
        /**
         * Prize :: {
         *     claims :: [PrizeClaim]
         *     name   :: String
         *     points :: Number
         * }
         *
         * PrizeCompletion :: {
         *     date :: Date
         *     user :: User
         * }
         */
        .factory('Prize', function (Type) {
            var Prize = Type({
                claims : [],
                name   : new TypeError('A prize must have a name.'),
                points : new TypeError('A prize must have a point value.')
            });
        });
}());
