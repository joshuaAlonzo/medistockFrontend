import type { ActivityLog, CartItem, Category, Medicine, Order, Supplier, UserRecord, UserRole } from "./pharmacyApi";

export const demoCategories: Category[] = [
  { categoryId: 1, categoryName: "Pain relief" }, { categoryId: 2, categoryName: "Vitamins & supplements" },
  { categoryId: 3, categoryName: "Cold & flu" }, { categoryId: 4, categoryName: "First aid" },
  { categoryId: 5, categoryName: "Digestive health" }, { categoryId: 6, categoryName: "Personal care" },
];

export const demoMedicines: Medicine[] = [
  { medicineId: 101, brandName: "Reliva 500", genericName: "Paracetamol", categoryId: 1, description: "Everyday pain and fever relief. Use only as directed on the package.", dosage: "500 mg · 20 tablets", manufacturer: "Northstar Labs", price: 6.4, stockQty: 148, image: "", status: "Available", createdAt: "2026-08-12T09:20:00Z", updatedAt: "2026-09-28T14:10:00Z" },
  { medicineId: 102, brandName: "Citra-C", genericName: "Ascorbic acid", categoryId: 2, description: "Vitamin C supplement in easy-to-take tablets.", dosage: "1000 mg · 30 tablets", manufacturer: "WellSpring Health", price: 12.9, stockQty: 67, image: "", status: "Available", createdAt: "2026-07-20T09:20:00Z", updatedAt: "2026-09-29T11:00:00Z" },
  { medicineId: 103, brandName: "ClearBreath", genericName: "Cetirizine hydrochloride", categoryId: 3, description: "Antihistamine tablets for seasonal allergy symptoms.", dosage: "10 mg · 10 tablets", manufacturer: "Northstar Labs", price: 9.75, stockQty: 19, image: "", status: "Available", createdAt: "2026-07-30T09:20:00Z", updatedAt: "2026-09-28T10:25:00Z" },
  { medicineId: 104, brandName: "CalmGut", genericName: "Oral rehydration salts", categoryId: 5, description: "Powder for oral rehydration. Follow package directions.", dosage: "5.6 g · 10 sachets", manufacturer: "HealthFirst Co.", price: 4.5, stockQty: 42, image: "", status: "Available", createdAt: "2026-07-18T09:20:00Z", updatedAt: "2026-09-27T08:00:00Z" },
  { medicineId: 105, brandName: "FlexiPatch", genericName: "Menthol topical patch", categoryId: 4, description: "Topical patch for temporary muscle comfort.", dosage: "5% · 5 patches", manufacturer: "MediCore", price: 15.2, stockQty: 0, image: "", status: "Out of stock", createdAt: "2026-06-01T09:20:00Z", updatedAt: "2026-09-29T17:00:00Z" },
  { medicineId: 106, brandName: "Daily D3", genericName: "Cholecalciferol", categoryId: 2, description: "Vitamin D3 softgels.", dosage: "1000 IU · 30 softgels", manufacturer: "WellSpring Health", price: 10.5, stockQty: 93, image: "", status: "Available", createdAt: "2026-08-01T09:20:00Z", updatedAt: "2026-09-26T12:00:00Z" },
  { medicineId: 107, brandName: "FreshShield", genericName: "Isopropyl alcohol", categoryId: 6, description: "Antiseptic solution for external use.", dosage: "70% · 250 mL", manufacturer: "MediCore", price: 7.8, stockQty: 11, image: "", status: "Available", createdAt: "2026-05-15T09:20:00Z", updatedAt: "2026-09-28T08:00:00Z" },
  { medicineId: 108, brandName: "Breathe Easy", genericName: "Saline nasal spray", categoryId: 3, description: "Non-medicated saline spray for nasal moisture.", dosage: "30 mL", manufacturer: "Northstar Labs", price: 8.25, stockQty: 54, image: "", status: "Available", createdAt: "2026-09-01T09:20:00Z", updatedAt: "2026-09-29T09:00:00Z" },
  { medicineId: 109, brandName: "GentleCare", genericName: "Zinc oxide cream", categoryId: 6, description: "Protective skin barrier cream.", dosage: "10% · 60 g", manufacturer: "HealthFirst Co.", price: 11.3, stockQty: 27, image: "", status: "Available", createdAt: "2026-08-03T09:20:00Z", updatedAt: "2026-09-29T07:00:00Z" },
];

export const demoSuppliers: Supplier[] = [
  { supplierId: 11, supplierName: "Northstar Medical Supply", contactPerson: "Mia Santos", contactNumber: "+63 917 550 0194", email: "orders@northstarmed.example", address: "Makati City", status: "Active", createdAt: "2025-02-10T08:00:00Z", updatedAt: "2026-09-20T08:00:00Z" },
  { supplierId: 12, supplierName: "WellSpring Health Distribution", contactPerson: "Daniel Cruz", contactNumber: "+63 917 482 2280", email: "sales@wellspring.example", address: "Quezon City", status: "Active", createdAt: "2025-04-18T08:00:00Z", updatedAt: "2026-09-15T08:00:00Z" },
  { supplierId: 13, supplierName: "HealthFirst Wholesale", contactPerson: "Paolo Reyes", contactNumber: "+63 905 113 7090", email: "hello@healthfirst.example", address: "Pasig City", status: "Active", createdAt: "2025-08-01T08:00:00Z", updatedAt: "2026-09-18T08:00:00Z" },
];

const mkItems = (ids: number[], qty: number[]): Order["items"] => ids.map((id, index) => {
  const med = demoMedicines.find((item) => item.medicineId === id)!;
  return { orderId: 0, medicineId: id, quantity: qty[index], unitPrice: med.price, subtotal: med.price * qty[index], brandName: med.brandName, genericName: med.genericName };
});

export const demoOrders: Order[] = [
  { orderId: 8042, userId: 204, orderDate: "2026-09-30T08:34:00+08:00", totalAmount: 25.8, paymentMethod: "Cash on delivery", deliveryAddress: "21 Lantana Street, Quezon City", orderStatus: "Pending", items: mkItems([102, 104], [1, 2]) },
  { orderId: 8041, userId: 205, orderDate: "2026-09-30T07:55:00+08:00", totalAmount: 19.5, paymentMethod: "Card at pickup", deliveryAddress: "Unit 8, Cedar Residences, Makati City", orderStatus: "Processing", items: mkItems([101, 103], [1, 1]) },
  { orderId: 8040, userId: 203, orderDate: "2026-09-29T16:42:00+08:00", totalAmount: 30.4, paymentMethod: "Cash on delivery", deliveryAddress: "9 Mabini Avenue, Pasig City", orderStatus: "Ready", items: mkItems([106, 105], [1, 1]) },
  { orderId: 8039, userId: 202, orderDate: "2026-09-29T14:20:00+08:00", totalAmount: 14.4, paymentMethod: "Cash on delivery", deliveryAddress: "14 Sunrise Lane, Manila", orderStatus: "Completed", items: mkItems([101, 108], [1, 1]) },
  { orderId: 8038, userId: 204, orderDate: "2026-09-28T11:05:00+08:00", totalAmount: 36.6, paymentMethod: "Card at pickup", deliveryAddress: "21 Lantana Street, Quezon City", orderStatus: "Completed", items: mkItems([109, 102, 104], [1, 1, 2]) },
  { orderId: 8037, userId: 201, orderDate: "2026-09-27T15:10:00+08:00", totalAmount: 23.4, paymentMethod: "Cash on delivery", deliveryAddress: "3 Palm Court, Taguig City", orderStatus: "Cancelled", items: mkItems([107, 101], [1, 1]) },
];

export const demoUsers: UserRecord[] = [
  { userId: 201, firstName: "Ari", lastName: "Santiago", email: "ari.s@example.test", contactNumber: "+63 917 200 1210", username: "ari.s", roleId: 1, createdAt: "2025-02-01T08:00:00Z" },
  { userId: 202, firstName: "Sam", lastName: "Lim", email: "sam.lim@example.test", contactNumber: "+63 917 992 8820", username: "sam.lim", roleId: 2, createdAt: "2025-03-11T08:00:00Z" },
  { userId: 203, firstName: "Rin", lastName: "Cruz", email: "rin.cruz@example.test", contactNumber: "+63 917 410 6552", username: "rin.cruz", roleId: 3, createdAt: "2025-04-18T08:00:00Z" },
  { userId: 204, firstName: "Noah", lastName: "Reyes", email: "noah.reyes@example.test", contactNumber: "+63 917 701 2551", username: "noah.reyes", roleId: 3, createdAt: "2025-05-09T08:00:00Z" },
  { userId: 205, firstName: "Mika", lastName: "Tan", email: "mika.tan@example.test", contactNumber: "+63 917 307 1804", username: "mika.tan", roleId: 3, createdAt: "2025-05-20T08:00:00Z" },
];
export const demoRoles: UserRole[] = [{ userRoleId: 1, userRole: "Admin" }, { userRoleId: 2, userRole: "Mod" }, { userRoleId: 3, userRole: "User" }];
export const demoActivity: ActivityLog[] = [
  { logId: 9901, userId: 202, activity: "Updated stock quantity for Daily D3 from 87 to 93", activityDate: "2026-09-30T08:32:00+08:00", ipAddress: "192.0.2.18" },
  { logId: 9900, userId: 201, activity: "Updated supplier contact details for WellSpring Health Distribution", activityDate: "2026-09-30T08:14:00+08:00", ipAddress: "192.0.2.12" },
  { logId: 9899, userId: 202, activity: "Moved order #8040 to Ready", activityDate: "2026-09-29T17:10:00+08:00", ipAddress: "192.0.2.18" },
  { logId: 9898, userId: 201, activity: "Added medicine record Breathe Easy", activityDate: "2026-09-29T15:40:00+08:00", ipAddress: "192.0.2.12" },
];
export const demoCart: CartItem[] = [
  { cartId: 71, userId: 301, medicineId: 101, quantity: 2, subtotal: 12.8, addedAt: "2026-09-30T08:00:00+08:00" },
  { cartId: 72, userId: 301, medicineId: 106, quantity: 1, subtotal: 10.5, addedAt: "2026-09-30T08:02:00+08:00" },
];
