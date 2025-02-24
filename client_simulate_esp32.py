import asyncio
import websockets
import json
import sys

async def receive_json_data():
    uri = "ws://localhost:8082"
    try:
        async with websockets.connect(uri) as websocket:
            while True:
                # 持续接收服务器的JSON数据
                response = await websocket.recv()
                print(f"Received JSON data: {response}")
    except ConnectionRefusedError:
        print("Error: Could not connect to server. Make sure the server is running.")
    except websockets.exceptions.ConnectionClosed:
        print("Connection closed by server.")

async def send_json_data():
    uri = "ws://localhost:8082"
    try:
        async with websockets.connect(uri) as websocket:
            # 发送JSON数据，格式为 {"type": "listen", "data": "start listening"}
            json_data = {"type": "listen", "data": "start listening"}
            await websocket.send(json.dumps(json_data))
            print(f"Sent JSON data: {json_data}")
    except ConnectionRefusedError:
        print("Error: Could not connect to server. Make sure the server is running.")
    except websockets.exceptions.ConnectionClosed:
        print("Connection closed by server.")

async def send_binary_data():
    uri = "ws://localhost:8082"
    try:
        async with websockets.connect(uri) as websocket:
            # 创建一个6字节的缓冲区
            binary_data = bytes([0x01, 0x02, 0x03, 0x04, 0x05, 0x06])
            # 发送二进制数据
            await websocket.send(binary_data)
            print(f"Sent binary data: {binary_data}")

            # 等待服务器的响应
            response = await websocket.recv()
            print(f"Received response from server: {response}")
    except ConnectionRefusedError:
        print("Error: Could not connect to server. Make sure the server is running.")
    except websockets.exceptions.ConnectionClosed:
        print("Connection closed by server.")

if __name__ == "__main__":
    try:
        # 你可以选择运行send_json_data、send_binary_data或receive_json_data来测试不同的功能
        # asyncio.run(send_json_data())
        asyncio.run(send_binary_data())
        # asyncio.run(receive_json_data())
    except KeyboardInterrupt:
        print("\nClient terminated.")
        sys.exit(0)