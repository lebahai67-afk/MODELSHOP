// admin/js/admin-sidebar.js - Điều khiển đóng/mở sidebar admin trên màn hình nhỏ (mobile).
// Trên desktop (>900px) sidebar luôn hiện cố định (xem CSS admin.css), file này chỉ có tác
// dụng thực sự khi ở chế độ mobile: nút hamburger (#sidebarToggle) bật/tắt class "open" trên
// sidebar + class "sidebar-open" trên <body> để hiện lớp phủ mờ (#sidebarBackdrop) phía sau.

document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.getElementById('adminSidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!sidebar || !toggleBtn || !backdrop) return;

    function openSidebar() {
        sidebar.classList.add('open');
        document.body.classList.add('sidebar-open');
    }
    function closeSidebar() {
        sidebar.classList.remove('open');
        document.body.classList.remove('sidebar-open');
    }

    toggleBtn.addEventListener('click', function () {
        sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    backdrop.addEventListener('click', closeSidebar);

    // Bấm chọn 1 mục trong menu trên mobile thì tự đóng sidebar lại (đỡ phải bấm thêm 1 lần).
    sidebar.querySelectorAll('.sidebar-nav a').forEach(a => a.addEventListener('click', closeSidebar));
});
