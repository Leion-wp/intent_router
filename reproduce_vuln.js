"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const security_1 = require("../src/security");
try {
    (0, security_1.validateStrictShellArg)('../../etc/passwd', 'path');
    console.log('❌ VULNERABILITY CONFIRMED: validateStrictShellArg allowed traversal path "../../etc/passwd"');
}
catch (e) {
    console.log('✅ validateStrictShellArg blocked traversal path');
}
try {
    (0, security_1.validateStrictShellArg)('/etc/shadow', 'path');
    console.log('❌ VULNERABILITY CONFIRMED: validateStrictShellArg allowed absolute path "/etc/shadow"');
}
catch (e) {
    console.log('✅ validateStrictShellArg blocked absolute path');
}
//# sourceMappingURL=reproduce_vuln.js.map