/* ==== PERMISSIONS.JS ==== */

const PERMISSIONS = {
    products: {
        create: ['root_admin', 'manager', 'accountant', 'warehouse_clerk'],
        edit: ['root_admin', 'manager', 'accountant', 'warehouse_clerk'],
        delete: []
    },
    categories: {
        create: ['root_admin', 'manager', 'accountant', 'warehouse_clerk'],
        edit: ['root_admin', 'manager', 'accountant', 'warehouse_clerk'],
        delete: ['root_admin', 'manager', 'accountant', 'warehouse_clerk']
    },
    suppliers: {
        create: ['root_admin', 'manager', 'warehouse_clerk'],
        edit: ['root_admin', 'manager'],
        deactivate: ['root_admin', 'manager'],
        delete: ['root_admin']
    },
    receive: {
        create: ['root_admin', 'manager', 'staff', 'warehouse_clerk'],
        viewAll: ['root_admin', 'manager', 'accountant', 'warehouse_clerk']
    },
    history: {
        viewAll: ['root_admin', 'manager', 'accountant', 'warehouse_clerk']
    },
    purchase_orders: {
        create: ['root_admin', 'manager', 'accountant', 'staff'],
        approve: ['root_admin', 'manager', 'accountant'],
        viewAll: ['root_admin', 'manager', 'accountant']
    },
    adjustments: {
        create: ['root_admin', 'manager', 'accountant', 'staff', 'warehouse_clerk'],
        viewAll: ['root_admin', 'manager', 'accountant', 'warehouse_clerk']
    },
    financial_data: {
        view: ['root_admin', 'manager', 'accountant']
    }
};

window.can = function (resource, action, role) {
    return (PERMISSIONS[resource]?.[action] || []).includes(role);
};