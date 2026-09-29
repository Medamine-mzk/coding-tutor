from numpy import array
n = int(input())
if n == 0:
    print("none")
else:
    T = array([0] * n)
    for i in range(0, n):
        T[i] = int(input())
    trouve = False
    for i in range(0, n):
        if T[i] % 2 == 0:
            print(T[i])
            trouve = True
    if not trouve:
        print("none")
