document.addEventListener("DOMContentLoaded", function() {
    var toggleFormButton = document.getElementById("toggleFormButton");
    var dataForm = document.getElementById("dataForm");
    var tableBody = document.getElementById("tableBody");

    toggleFormButton.addEventListener("click", function() {
        if (dataForm.style.display === "none") {
            dataForm.style.display = "block";
        } else {
            dataForm.style.display = "none";
        }
    });

    var addButton = document.getElementById("addButton");
    addButton.addEventListener("click", function(event) {
        event.preventDefault(); // Prevent form submission
        var ship = document.getElementById("ship").value;
        var customerInfo = document.getElementById("customerInfo").value;
        var totalAmount = document.getElementById("totalAmount").value;
        var cause = document.getElementById("cause").value;

        // Create a new row
        var newRow = document.createElement("tr");
        newRow.innerHTML = `
            <td>${ship}</td>
            <td>${customerInfo}</td>
            <td>${totalAmount}</td>
            <td>${cause}</td>
            <td>admin</td>
            <td><input type="checkbox" style="width: 20px; height: 20px;"></td>
        `;

        
        tableBody.appendChild(newRow);

        document.getElementById("ship").value = "";
        document.getElementById("customerInfo").value = "";
        document.getElementById("totalAmount").value = "";
        document.getElementById("cause").value = "";

        var checkboxes = tableBody.querySelectorAll("input[type='checkbox']");
        checkboxes[checkboxes.length - 1].addEventListener("change", function() {
            if (this.checked) {
                // Apply styles to make the row faded
                newRow.style.opacity = "0.5";
                newRow.style.pointerEvents = "none";
                // Move the row to the bottom
                tableBody.appendChild(newRow);
            } else {
                // Restore original styles
                newRow.style.opacity = "1";
                newRow.style.pointerEvents = "auto";
            }
        });
    });

    var clearDataButton = document.getElementById("clearDataButton");
    clearDataButton.addEventListener("click", function() {
        document.getElementById("return-product").reset();
    });
});
