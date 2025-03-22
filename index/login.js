document.addEventListener('DOMContentLoaded', function () {
    var checkLogin = 0;
    let userTypes = {
      'admin': {'password': 'admin123', 'checkLogin': '1'},
      'my': {'password': 'my2804', 'checkLogin': '2'},
      'lai': {'password': 'lai2506', 'checkLogin': '3'},
      'huyen': {'password': 'huyen2307', 'checkLogin': '4'},
      'hanh': {'password': 'hanh1206', 'checkLogin': '5'},
      'duyen': {'password': 'duyen3009', 'checkLogin': '6'},
      'coi': {'password': 'coi2806', 'checkLogin': '7'},
      'khach': {'password': '777', 'checkLogin': '777'}
    };

    // Hàm đăng nhập
    function login() {
        var username = document.getElementById('username').value.trim();
        var password = document.getElementById('password').value.trim();
        const userInfo = userTypes[username];

        if (userInfo && password === userInfo.password) {
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userType', `${username}-${userInfo.password}`);
            checkLogin = userInfo.checkLogin;
            window.location.href = './live/index.html';
        } else {
            alert('Sai thông tin đăng nhập.');
        }
    }

    // Gán sự kiện click cho nút đăng nhập
    document.getElementById('loginButton').addEventListener('click', login);

    // Lắng nghe sự kiện nhấn phím Enter trên toàn bộ tài liệu
    document.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            login();
        }
    });
});
