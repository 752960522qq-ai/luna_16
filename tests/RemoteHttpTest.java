import com.luna.blindfire.RemoteHttp;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.*;

/** Two independent APK transports, with the exact same HTTPS client as production. */
public final class RemoteHttpTest {
    static final String UA="Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/153.0.0.0 Mobile Safari/537.36";
    static final class Client implements RemoteHttp.Listener {
        final RemoteHttp http;final AtomicInteger number=new AtomicInteger();
        final ConcurrentHashMap<String,CompletableFuture<Reply>> pending=new ConcurrentHashMap<String,CompletableFuture<Reply>>();
        Client(String url){http=new RemoteHttp(url,UA,this);}
        public void response(String id,int status,String body,String error){CompletableFuture<Reply> f=pending.remove(id);if(f!=null)f.complete(new Reply(status,body,error));}
        Reply post(String path,String json)throws Exception{
            String id="native_test_"+number.incrementAndGet();CompletableFuture<Reply> f=new CompletableFuture<Reply>();pending.put(id,f);http.request(id,path,json,15000);return f.get(20,TimeUnit.SECONDS);
        }
    }
    static final class Reply {final int status;final String body,error;Reply(int status,String body,String error){this.status=status;this.body=body;this.error=error;}}
    static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
    static String field(String body,String key){Matcher m=Pattern.compile("\""+key+"\":\"([^\"]+)\"").matcher(body);check(m.find(),"Missing response field: "+key);return m.group(1);}
    static String auth(String code,String token){return "\"version\":8,\"code\":\""+code+"\",\"token\":\""+token+"\"";}
    static void success(Reply r){check(r.status==200,"Native room request failed: HTTP "+r.status+" "+r.error);}
    public static void main(String[] args)throws Exception{
        String url=args[0]+"/api/rooms/";Client a=new Client(url),b=new Client(url);String code=null,key=null;
        try {
            Reply created=a.post("create","{\"version\":8}");success(created);code=field(created.body,"code");key=field(created.body,"token");check(code.matches("[0-9]{4}"),"Expected four-digit room code");
            Reply joined=b.post("join","{\"version\":8,\"code\":\""+code+"\"}");success(joined);String guest=field(joined.body,"token");check(!guest.equals(key),"Roles must have independent private credentials");
            String state="{\"type\":\"state\",\"view\":{\"version\":8,\"t\":1,\"own\":{\"x\":250,\"y\":10,\"z\":500},\"shots\":[],\"sounds\":[]}}";
            Reply host=a.post("exchange","{"+auth(code,key)+",\"state\":"+state+",\"stateSeq\":1,\"ack\":0}");success(host);check(host.body.contains("\"joined\":true"),"Host not connected");
            String commands="[{\"type\":\"command\",\"seq\":1,\"action\":{\"type\":\"control\",\"throttle\":1,\"steer\":0}}]";
            Reply frame=b.post("exchange","{"+auth(code,guest)+",\"commands\":"+commands+"}");success(frame);check(frame.body.contains("\"x\":250"),"Guest did not receive its view");
            success(b.post("exchange","{"+auth(code,guest)+",\"commands\":"+commands+"}"));
            host=a.post("exchange","{"+auth(code,key)+",\"state\":"+state+",\"stateSeq\":2,\"ack\":0}");success(host);check(host.body.contains("\"seq\":1"),"Ordered guest input missing");
            host=a.post("exchange","{"+auth(code,key)+",\"state\":"+state+",\"stateSeq\":3,\"ack\":1}");success(host);check(host.body.contains("\"commands\":[]"),"Input acknowledgement failed");
            success(a.post("leave","{"+auth(code,key)+"}"));frame=b.post("exchange","{"+auth(code,guest)+",\"commands\":[]}");success(frame);check(frame.body.contains("\"closed\":true"),"Room did not close");
            System.out.println("PASS two native APK HTTP transports: four digits, private tokens, state, ordered input, duplicate retry/ACK, room closure");
        } finally {if(code!=null&&key!=null)try{a.post("leave","{"+auth(code,key)+"}");}catch(Exception ignored){}a.http.close();b.http.close();}
    }
}
