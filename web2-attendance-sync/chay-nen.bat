@echo off
REM #Note: WEB2.0 - Vong lap chay sync.js, TU CHAY LAI neu node thoat (loi/mat mang).
REM Duoc goi boi run-hidden.vbs (chay AN, khong hien cua so). KHONG bam dup truc tiep
REM file nay (se hien cua so); muon chay tay co cua so thi dung install-windows.bat.
cd /d "%~dp0"
:loop
node sync.js
REM node sync.js binh thuong chay mai (dong bo moi 5 phut). Neu no thoat = co su co
REM -> doi ~15 giay roi chay lai (tu phuc hoi). Dung ping thay timeout vi timeout
REM co the loi khi chay AN cua so (khong co console tuong tac).
ping -n 16 127.0.0.1 >nul
goto loop
