function initializeWebSocket(data = {}) {
  const ws = new WebSocket("ws://" + location.host + "/");

  ws.onopen = () => {
    console.log("connected to server");

    ws.send(JSON.stringify({
      event: "create",
      data: data
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const element = document.querySelector(".logs");

    switch (data.event) {
      case "damaged":
        element.innerHTML += `<p>damaged, current health: ${data.health}</p>`;

        element.style.backgroundColor = "red";
        element.style.transition = "background-color 0.1s linear";

        setTimeout(() => {
          element.style.transition = "background-color 1s ease-out";
          element.style.backgroundColor = "";
        }, 600);

        break;
      default:
        console.log(`Unknown event: ${data.event}`);
    }
  };

  return ws;
}