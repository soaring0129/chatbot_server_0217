import asyncio
import websockets
import sys

async def chat_client():
    """
    Asynchronous function for a chat client that connects to a server via websockets.
    The client prompts the user for a username and password, sends them to the server for authentication,
    and engages in a chat session upon successful authentication.
    """
    uri = "ws://localhost:8080"
    try:
        # Prompt for username and password
        username = input("Enter username: ")
        password = input("Enter password: ")
        
        async with websockets.connect(uri) as websocket:
            # Send username and password for authentication
            await websocket.send(f"{username}:{password}")
            auth_response = await websocket.recv()
            
            # Check authentication response
            if auth_response != "Authentication successful":
                print(auth_response)
                sys.exit(1)
                
            print("Authentication successful. Connected to server. Type '/exit' to quit.")
            while True:
                try:
                    message = input("You: ")
                    # Check for exit commands to disconnect
                    if message.lower() == '/exit' or message == "/bye":
                        print("Disconnecting...")
                        break
                    
                    # Send message to server
                    await websocket.send(message)
                    print("Assistant: ", end="", flush=True)
                    
                    # Receive and print responses from the server
                    async for response in websocket:
                        if response == '[DONE]':
                            break
                        print(response, end="", flush=True)
                    print("\n")
                    
                except KeyboardInterrupt:
                    # Handle keyboard interrupt to disconnect gracefully
                    print("\nDisconnecting...")
                    await websocket.close()
                    break
                    
    except ConnectionRefusedError:
        # Handle connection refused error
        print("Error: Could not connect to server. Make sure the server is running.")
        sys.exit(1)
    except websockets.exceptions.ConnectionClosed:
        # Handle closed connection from server
        print("\nConnection closed by server.")
        sys.exit(0)

if __name__ == "__main__":
    try:
        asyncio.run(chat_client())
    except KeyboardInterrupt:
        print("\nClient terminated.")
        sys.exit(0)