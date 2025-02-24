import asyncio
import websockets
import json
import struct

async def connect_to_server():
    uri = "ws://localhost:8081"
    async with websockets.connect(uri) as websocket:
        print("Connected to server at", uri)
        
        while True:
            # 接收来自服务器的二进制数据
            response = await websocket.recv()
            
            # 解析二进制数据
            if isinstance(response, bytes):
                # 解析前4字节为session_id的长度
                session_id_length = int.from_bytes(response[:4], byteorder='big')
                
                # 解析session_id
                session_id = response[4:4 + session_id_length].decode('utf-8')
                
                # 解析接下来的4字节为pcm的长度
                pcm_length = int.from_bytes(response[4 + session_id_length:8 + session_id_length], byteorder='big')
                
                # 解析pcm
                pcm = response[8 + session_id_length:8 + session_id_length + pcm_length]
                
                # 构建JSON对象
                json_data = {
                    "session_id": session_id,
                    "pcm_length": pcm_length,
                    "pcm": list(pcm)  # 将bytes转换为列表以便于查看
                }
                
                # 打印解析后的JSON数据
                print(f"Received and parsed binary pcm data: {json.dumps(json_data)}")
                
                # 构造新的JSON对象，用来模拟asr转换得到的文本，返回给服务器
                new_json_data = {
                    "session_id": session_id,
                    "type": "chat",
                    "content": "Hello, this is a test message."
                }
                
                # 将新的JSON对象发送回服务器
                await websocket.send(json.dumps(new_json_data))
            else:
                # 处理非二进制数据
                print(f"Received response: {response}")

if __name__ == "__main__":
    asyncio.run(connect_to_server())