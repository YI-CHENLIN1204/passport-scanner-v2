from v6_name_gate import propose_names

def box(x,y,w=25,h=20):
    return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]

assert len(propose_names(['姓名','林奕辰'],[box(10,10),box(60,10)],[.99,.91],200))==1
assert [p.text for p in propose_names(['姓名:林奕辰'],[box(10,10)],[.91],200)]==['林奕辰']
assert [p.text for p in propose_names(['中文姓名：林奕辰'],[box(10,10)],[.91],200)]==['林奕辰']
assert len(propose_names(['姓名','林奕辰','林奕辰'],[box(10,10),box(60,10),box(60,10)],[.99,.91,.89],200))==1
assert len(propose_names(['姓名:林奕辰','姓名:王大明'],[box(10,10),box(10,10)],[.90,.91],200))==2
assert not propose_names(['林奕辰'],[box(60,10)],[.91],200)
assert not propose_names(['姓名','林奕辰'],[box(10,10),box(60,90)],[.99,.91],200)
assert not propose_names(['姓名:林奕辰'],[box(10,150)],[.91],200)
assert not propose_names(['姓名:林奕辰'],[box(10,10)],[.60],200)
assert not propose_names(['姓名:ABC123'],[box(10,10)],[.91],200)
assert not propose_names(['中文姓名不是姓名'],[box(10,10)],[.91],200)
print('v6 truth-blind gate synthetic tests passed')
