import com.luna.blindfire.LanLink;
import java.util.concurrent.*;
import java.net.*;
import java.io.*;

public class LanLinkTest {
    public static void main(String[] args) throws Exception {
        final CountDownLatch listening=new CountDownLatch(1),connected=new CountDownLatch(2),received=new CountDownLatch(2),closed=new CountDownLatch(1);
        final int[] port={0};
        LanLink host=new LanLink(new LanLink.Listener(){
            public void listening(int p){port[0]=p;listening.countDown();}
            public void connected(boolean h){connected.countDown();}
            public void data(String d){if(!d.equals("{\"type\":\"command\",\"x\":120}"))throw new AssertionError(d);received.countDown();}
            public void closed(String m){closed.countDown();}
        });
        LanLink guest=new LanLink(new LanLink.Listener(){
            public void listening(int p){}
            public void connected(boolean h){connected.countDown();}
            public void data(String d){if(!d.equals("{\"type\":\"state\",\"text\":\"盲区交火\"}"))throw new AssertionError(d);received.countDown();}
            public void closed(String m){closed.countDown();}
        });
        host.host(0,"123456");if(!listening.await(4,TimeUnit.SECONDS))throw new AssertionError("host bind");
        Socket bad=new Socket("127.0.0.1",port[0]);BufferedWriter writer=new BufferedWriter(new OutputStreamWriter(bad.getOutputStream(),"UTF-8"));writer.write("BLINDFIRE8 000000\n");writer.flush();
        if(!new BufferedReader(new InputStreamReader(bad.getInputStream(),"UTF-8")).readLine().equals("DENIED"))throw new AssertionError("room code rejection");bad.close();
        Socket old=new Socket("127.0.0.1",port[0]);BufferedWriter legacy=new BufferedWriter(new OutputStreamWriter(old.getOutputStream(),"UTF-8"));legacy.write("BLINDFIRE7 123456\n");legacy.flush();
        if(!"DENIED".equals(new BufferedReader(new InputStreamReader(old.getInputStream(),"UTF-8")).readLine()))throw new AssertionError("old version rejection");old.close();
        guest.join("127.0.0.1",port[0],"123456");if(!connected.await(4,TimeUnit.SECONDS))throw new AssertionError("connect after bad code");
        host.send("{\"type\":\"state\",\"text\":\"盲区交火\"}");guest.send("{\"type\":\"command\",\"x\":120}");
        if(!received.await(4,TimeUnit.SECONDS))throw new AssertionError("bidirectional UTF-8");
        guest.close();if(!closed.await(4,TimeUnit.SECONDS))throw new AssertionError("disconnect notification");host.close();
        System.out.println("PASS real TCP room-code / version validation, two-way UTF-8 data and disconnection");
    }
}
