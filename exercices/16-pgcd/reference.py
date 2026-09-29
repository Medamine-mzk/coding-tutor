a = int(input())
b = int(input())
while b != 0:
    r = a % b
    a = b
    b = r
print(a)
